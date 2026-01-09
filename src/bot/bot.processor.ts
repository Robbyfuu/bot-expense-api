/* eslint-disable */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { OpenAIService } from '../openai/openai.service';
import { DteService } from '../dte/dte.service';

@Injectable()
export class BotProcessorService {
  private readonly logger = new Logger(BotProcessorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openAIService: OpenAIService,
    private readonly dteService: DteService,
  ) {}

  async processImage(userId: string, imageBuffer: Buffer): Promise<string> {
    this.logger.log(`Processing image for user ${userId}`);

    // 1. Try DTE (PDF417)
    const dteData = await this.dteService.decode(imageBuffer);

    let expenseData: any = {};

    if (dteData) {
      this.logger.log(
        `DTE detected: Folio ${dteData.folio}, Amount ${dteData.montoTotal}`,
      );
      expenseData = {
        merchant: '', // Will be resolved via RUT
        rut: dteData.rutEmisor,
        receipt_number: dteData.folio,
        amount: dteData.montoTotal,
        date: dteData.fecha, // YYYY-MM-DD
        category: null,
        payment_method: null,
        items: [],
      };
    } else {
      // 2. Fallback to OpenAI
      expenseData = await this.openAIService.processReceipt(
        imageBuffer,
        'image/jpeg',
      );
    }

    // Resolver Merchant
    let merchantId: string | null = null;
    let merchantName = expenseData.merchant || 'Comercio Desconocido';
    const rut = expenseData.rut;
    const receiptNumber = expenseData.receipt_number;
    let expenseCategory = expenseData.category;
    let paidWithCardId: string | null = null;
    const paymentMethod = expenseData.payment_method;

    // Resolver Tarjeta de Crédito (si aplica)
    if (paymentMethod === 'Credit') {
      const creditCards = await this.prisma.creditCard.findMany({
        where: { userId },
      });

      if (creditCards.length > 0) {
        if (expenseData.card_name) {
          // Fuzzy match simple
          const match = creditCards.find((c) =>
            c.name.toLowerCase().includes(expenseData.card_name.toLowerCase()),
          );
          if (match) paidWithCardId = match.id;
        }

        // Si solo hay una tarjeta y no se detectó nombre específico, asumimos esa (opcional, por ahora mejor ser explícito)
        // if (!paidWithCardId && creditCards.length === 1) paidWithCardId = creditCards[0].id;
      }
    }

    if (rut) {
      const existingMerchant = await this.prisma.merchant.findUnique({
        where: { rut },
      });
      if (existingMerchant) {
        merchantId = existingMerchant.id;
        merchantName = existingMerchant.name;
        if (!expenseCategory && existingMerchant.category) {
          expenseCategory = existingMerchant.category;
        }
      }
    }

    if (!merchantId && merchantName) {
      const existingMerchant = await this.prisma.merchant.findFirst({
        where: { name: { equals: merchantName, mode: 'insensitive' } },
      });
      if (existingMerchant) {
        merchantId = existingMerchant.id;
        if (!expenseCategory && existingMerchant.category) {
          expenseCategory = existingMerchant.category;
        }
      }
    }

    if (!merchantId) {
      const newMerchant = await this.prisma.merchant.create({
        data: {
          name: merchantName,
          rut: rut || null,
          category: expenseCategory || null,
        },
      });
      merchantId = newMerchant.id;
    }

    // Guardar Expense PENDING
    const savedExpense = await this.prisma.expense.create({
      data: {
        amount: expenseData.amount || 0,
        merchant: merchantName,
        merchantId: merchantId,
        category: expenseCategory || 'Otros',
        date: expenseData.date ? new Date(expenseData.date) : new Date(),
        items: expenseData.items || [],
        receiptNumber: receiptNumber || null,
        userId: userId,
        status: 'PENDING',
        paidWithCardId: paidWithCardId,
        // paymentMethod could be stored in rawText or a new field if needed, for now implicitly handled via paidWithCardId
        rawText: paymentMethod ? `Método: ${paymentMethod}` : null,
      },
      include: {
        paidWithCard: true,
      },
    });

    let msg = `🧾 *Borrador Detectado*:\n\n🏪 *${merchantName}* ${rut ? `(${rut})` : ''}\n📄 N°: ${savedExpense.receiptNumber || 'N/A'}\n💰 $${savedExpense.amount}\n📂 ${savedExpense.category}`;

    if (paymentMethod === 'Credit') {
      if (savedExpense.paidWithCard) {
        msg += `\n💳 Tarjeta: *${savedExpense.paidWithCard.name}*`;
      } else {
        msg += `\n💳 Crédito Detectado (Sin asignar)`;
      }
    }

    msg += `\n\n¿Es correcto? Responde:\n- *SI* para guardar\n- *NO* para descargar\n- O corrige (ej: "Usa tarjeta Visa")`;

    return msg;
  }

  async processText(userId: string, text: string): Promise<string> {
    const cleanText = text.trim().toLowerCase();

    const pendingExpense = await this.prisma.expense.findFirst({
      where: { userId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });

    if (!pendingExpense) {
      // Si no hay pendiente, quizás responder ayuda o ignorar
      return 'No hay gastos pendientes de confirmación. Envía una foto de un recibo para comenzar.';
    }

    // Confirmación
    if (['si', 'sí', 'ok', 'yes', 'correcto', 'save'].includes(cleanText)) {
      await this.prisma.expense.update({
        where: { id: pendingExpense.id },
        data: { status: 'CONFIRMED' },
      });

      const finalExpense = await this.prisma.expense.findUnique({
        where: { id: pendingExpense.id },
        include: { merchantRel: true },
      });

      if (!finalExpense) return 'Error al recuperar el gasto.';

      const merchantDisplay =
        finalExpense.merchantRel?.name || finalExpense.merchant;
      const rutDisplay = finalExpense.merchantRel?.rut
        ? `(${finalExpense.merchantRel.rut})`
        : '';

      return `✅ *Gasto Guardado Exitosamente*\n\n📅 ${finalExpense.date.toLocaleDateString()}\n🏪 *${merchantDisplay}* ${rutDisplay}\n💰 $${finalExpense.amount}\n📂 ${finalExpense.category}`;
    }

    // Rechazo
    if (['no', 'nop', 'cancelar', 'borrar', 'del'].includes(cleanText)) {
      await this.prisma.expense.update({
        where: { id: pendingExpense.id },
        data: { status: 'REJECTED' },
      });
      return '❌ Gasto descartado.';
    }

    // Selección Numérica
    const selection = parseInt(cleanText);
    if (!isNaN(selection) && selection > 0) {
      const searchTerm = pendingExpense.merchant;
      const candidates = await this.findMerchantCandidates(searchTerm);

      if (candidates[selection - 1]) {
        const selected = candidates[selection - 1];
        await this.prisma.expense.update({
          where: { id: pendingExpense.id },
          data: { merchantId: selected.id, merchant: selected.name },
        });
        return `👌 Seleccionado: *${selected.name}*.\n¿Todo listo? Responde *SI* para guardar.`;
      }
    }

    // Corrección (OpenAI)
    const updates = await this.openAIService.parseCorrection(
      pendingExpense,
      text,
    );

    if (Object.keys(updates).length > 0) {
      let responseMsg = '';

      // Handle Card/Payment Updates
      if (updates.card_name) {
        const cards = await this.prisma.creditCard.findMany({
          where: {
            userId,
            name: { contains: updates.card_name, mode: 'insensitive' },
          },
        });

        if (cards.length === 1) {
          updates['paidWithCardId'] = cards[0].id;
          delete updates.card_name;
          responseMsg += `💳 Tarjeta asignada: *${cards[0].name}*\n`;
        } else if (cards.length > 1) {
          // Si hay varias, listarlas. (MVP: Tomamos la primera o pedimos ser mas especifico)
          // Para ser robusto deberiamos guardar estado, pero por ahora pedimos correccion especifica.
          return `💳 Encontré varias tarjetas para "${updates.card_name}":\n${cards.map((c) => `- ${c.name}`).join('\n')}\nPor favor sé más específico (ej: "Usa la tarjeta número 2" no soportado aun, di el nombre completo)`;
        } else {
          // No found: Try listing all cards
          const allCards = await this.prisma.creditCard.findMany({
            where: { userId },
          });
          if (allCards.length > 0) {
            return `❌ No encontré tarjeta "${updates.card_name}". Tus tarjetas:\n${allCards.map((c) => `- ${c.name}`).join('\n')}`;
          }
        }
      }

      if (updates.payment_method && updates.payment_method !== 'Credit') {
        updates['paidWithCardId'] = null; // Clear card if switching to Debit/Cash
      }

      // Clean up fields not in Expense model
      delete updates.card_name;
      delete updates.payment_method;

      if (updates.merchant) {
        // Update temporal y buscar candidatos merchant
        await this.prisma.expense.update({
          where: { id: pendingExpense.id },
          data: updates,
        });

        const candidates = await this.findMerchantCandidates(updates.merchant);

        if (candidates.length > 1) {
          let listMsg = `🔎 Encontré varios comercios para "*${updates.merchant}*":\n`;
          candidates.forEach((m, idx) => {
            listMsg += `${idx + 1}. *${m.name}* ${m.rut ? `(${m.rut})` : ''}\n`;
          });
          listMsg += `\nResponde el *número* para seleccionar, o *SI* para guardar como nuevo.\n(Si asignaste tarjeta, se guardó)`;
          return listMsg;
        } else if (candidates.length === 1) {
          const m = candidates[0];
          await this.prisma.expense.update({
            where: { id: pendingExpense.id },
            data: { merchantId: m.id, merchant: m.name },
          });
        }
      } else {
        await this.prisma.expense.update({
          where: { id: pendingExpense.id },
          data: updates,
        });
      }

      const newExp = await this.prisma.expense.findUnique({
        where: { id: pendingExpense.id },
        include: { paidWithCard: true },
      });
      if (!newExp) return 'Error actualizando.';

      let finalMsg = `✏️ *Gasto Actualizado*:\n\n🏪 *${newExp.merchant}*\n💰 $${newExp.amount}\n📂 ${newExp.category}`;
      if (newExp.paidWithCard) {
        finalMsg += `\n💳 Tarjeta: *${newExp.paidWithCard.name}*`;
      }
      finalMsg += `\n\n¿Ahora está correcto? (Si/No/Corrección)`;
      return finalMsg;
    }

    return '🤔 No entendí la corrección. Intenta ser más explícito. Ej: "Usa tarjeta visa", "Monto 5000"';
  }

  private async findMerchantCandidates(term: string) {
    let candidates = await this.prisma.merchant.findMany({
      where: { name: { contains: term, mode: 'insensitive' } },
      take: 5,
    });

    if (candidates.length === 0) {
      const terms = term
        .trim()
        .split(/\s+/)
        .filter((t) => t.length > 2);
      if (terms.length > 0) {
        candidates = await this.prisma.merchant.findMany({
          where: {
            OR: terms.map((t) => ({
              name: { contains: t, mode: 'insensitive' },
            })),
          },
          take: 5,
        });
      }
    }
    return candidates;
  }
}
