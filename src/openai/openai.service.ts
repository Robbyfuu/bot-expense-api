/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';

@Injectable()
export class OpenAIService {
  private openai: OpenAI;
  private readonly logger = new Logger(OpenAIService.name);

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  async processReceipt(imageBuffer: Buffer, mimeType: string) {
    try {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY not configured');
      }

      this.logger.log('Processing receipt image with OpenAI GPT-4o...');

      const base64Image = imageBuffer.toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64Image}`;

      const today = new Date().toLocaleString('es-CL', {
        timeZone: 'America/Santiago',
      });

      const prompt = `Eres un experto contable y asistente financiero.
      Hoy es: ${today}.
      
      Analiza la imagen proporcionada. Puede ser:
      1. Una boleta/factura chilena.
      2. Un pantallazo de una notificación bancaria (banco, app de pagos, etc.).

      Si hay MÚLTIPLES notificaciones en la imagen, extrae solo la MÁS RECIENTE (la de más arriba).
      
      Extrae los siguientes datos en formato JSON estricto:
      - 'merchant': nombre del comercio (string). Si es notificación, limpia el nombre (ej: "CMP LIDER" -> "Lider").
      - 'rut': RUT del emisor si es visible (string, formato chileno XX.XXX.XXX-X).
      - 'receipt_number': número de boleta o factura (string). Busca "Boleta N°", "Folio", "#", "N° Operación".
      - 'amount': total de la boleta o transacción (número entero, pesos chilenos, sin puntos).
      - 'date': fecha de la transacción (string ISO 8601 YYYY-MM-DDTHH:mm:ss.sssZ). 
         - Si dice "ayer", calcula la fecha correcta basada en que hoy es ${today}. 
         - Si solo hay hora (ej "11:47 a.m."), asume que es la fecha de hoy.
      - 'category': categoría sugerida (Comida, Supermercado, Transporte, Hogar, Salud, Otros).
      - 'payment_method': método de pago detectado (string enum: 'Debit', 'Credit', 'Cash', 'Transfer'). Si es Crédito, intenta extraer el nombre del banco o tarjeta (ej: "Visa Falabella").
      - 'items': lista de items. Si es notificación, deja null o lista vacía.
      
      Si no puedes leer algún dato, intenta inferirlo o déjalo como null.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful accountant assistant that extracts data from receipts in JSON format.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl,
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      this.logger.log('OpenAI response received');
      this.logger.debug(content);

      if (!content) throw new Error('Empty response from OpenAI');

      return JSON.parse(content);
    } catch (error) {
      this.logger.error('Error processing receipt with OpenAI', error);
      throw error;
    }
  }

  async parseCorrection(currentData: any, correctionText: string) {
    try {
      this.logger.log(`Parsing correction: "${correctionText}"`);

      const prompt = `Current expense data: ${JSON.stringify(currentData)}
      User correction instruction: "${correctionText}"
      
      Update the JSON fields based on the user's instruction.
      - Return ONLY the fields that need to be changed in a valid JSON object.
      - If the user wants to change amount, return 'amount' as integer.
      - If category, return 'category'.
      - If payment method, return 'payment_method' (Debit/Credit/Cash/Transfer).
      - If credit card name, return 'card_name'.
      - If items need adjustment, return 'items'.
      - Do not include unchanged fields unless necessary for context (but prefer minimal output).`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are a smart assistant that updates JSON data based on natural language corrections.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0].message.content;
      this.logger.debug(`Correction result: ${content}`);
      return JSON.parse(content || '{}');
    } catch (error) {
      this.logger.error('Error parsing correction', error);
      return {}; // Return empty to minimize disruption
    }
  }
}
