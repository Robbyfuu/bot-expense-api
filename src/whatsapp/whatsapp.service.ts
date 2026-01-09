/* eslint-disable @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  downloadMediaMessage,
  proto,
  WASocket,
} from '@whiskeysockets/baileys';
import * as qrcode from 'qrcode-terminal';
import { Boom } from '@hapi/boom';
import { PrismaService } from '../prisma.service';
import { BotProcessorService } from '../bot/bot.processor';

@Injectable()
export class WhatsappService implements OnModuleInit, OnModuleDestroy {
  private sock: WASocket | undefined;
  private readonly logger = new Logger(WhatsappService.name);
  private readonly authPath = './auth_info_baileys';
  private allowedNumbers: string[] = [];
  private isConnecting = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly botProcessor: BotProcessorService,
  ) {}

  async sendMessage(to: string, text: string) {
    if (this.sock && this.sock.user) {
      await this.sock.sendMessage(to, { text });
    } else {
      this.logger.warn('WhatsApp socket not ready');
    }
  }

  async onModuleInit() {
    this.loadAllowedNumbers();
    await this.connectToWhatsApp();
  }

  onModuleDestroy() {
    if (this.sock) {
      this.sock.end(undefined);
      this.sock = undefined;
    }
  }

  private loadAllowedNumbers() {
    const envNumbers = process.env.ALLOWED_NUMBERS;
    if (envNumbers) {
      try {
        // Support both JSON (legacy) and CSV
        if (envNumbers.trim().startsWith('[')) {
          this.allowedNumbers = JSON.parse(envNumbers) as string[];
        } else {
          this.allowedNumbers = envNumbers.split(',').map((n) => n.trim());
        }
      } catch (e) {
        this.logger.error('Failed to parse ALLOWED_NUMBERS', e);
      }
    }
  }

  async connectToWhatsApp() {
    if (this.isConnecting) return;
    this.isConnecting = true;

    if (this.sock) {
      try {
        this.sock.end(undefined);
        this.sock = undefined;
      } catch {
        // ignore
      }
    }

    const { state, saveCreds } = await useMultiFileAuthState(this.authPath);
    const { version } = await fetchLatestBaileysVersion();

    const silentLogger: any = {
      trace: () => {},
      debug: () => {},
      info: () => {},
      warn: (msg) => this.logger.warn(msg),
      error: (msg) => this.logger.error(msg),
      child: () => silentLogger,
    };

    this.sock = makeWASocket({
      version,
      printQRInTerminal: false,
      auth: state,
      logger: silentLogger,
      browser: ['ExpenseBot', 'Chrome', '1.0.0'],
    });

    this.sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.logger.log('Scan QR to login:');
        qrcode.generate(qr, { small: true });
        this.isConnecting = false;
      }

      if (connection === 'close') {
        this.isConnecting = false;
        const error = (lastDisconnect?.error as Boom)?.output?.statusCode;
        const shouldReconnect = (error as any) !== DisconnectReason.loggedOut;
        if (shouldReconnect) {
          const delay = error === 409 ? 10000 : 5000;
          setTimeout(() => void this.connectToWhatsApp(), delay);
        }
      } else if (connection === 'open') {
        this.logger.log('WhatsApp connected!');
        this.isConnecting = false;
      }
    });

    this.sock.ev.on('creds.update', () => void saveCreds());

    this.sock.ev.on('messages.upsert', (m) => {
      void (async () => {
        if (m.type === 'notify') {
          for (const msg of m.messages) {
            await this.handleMessage(msg);
          }
        }
      })();
    });
  }

  private async handleMessage(msg: proto.IWebMessageInfo) {
    if (
      !this.sock ||
      !msg.message ||
      !msg.key ||
      msg.key.fromMe ||
      !msg.key.remoteJid
    )
      return;

    const remoteJid = msg.key.remoteJid;
    const participant = msg.key.participant || remoteJid;

    if (
      this.allowedNumbers.length > 0 &&
      participant &&
      !this.allowedNumbers.includes(participant)
    ) {
      return;
    }

    const isImage = !!msg.message.imageMessage;
    const isText =
      !!msg.message.conversation || !!msg.message.extendedTextMessage?.text;
    const textBody =
      msg.message.conversation || msg.message.extendedTextMessage?.text;

    try {
      if (this.sock) {
        await this.sock.sendPresenceUpdate('composing', remoteJid);
      }

      // Resolve User
      const user = await this.resolveUser(
        participant,
        msg.pushName ?? undefined,
      );
      let responseText = '';

      if (isImage && this.sock) {
        const buffer = await downloadMediaMessage(
          msg as any,
          'buffer',
          {},
          {
            logger: console as any,
            reuploadRequest: this.sock.updateMediaMessage,
          },
        );
        responseText = await this.botProcessor.processImage(user.id, buffer);
      } else if (isText && textBody) {
        responseText = await this.botProcessor.processText(user.id, textBody);
      }

      if (responseText && this.sock) {
        await this.sock.sendMessage(
          remoteJid,
          { text: responseText },
          { quoted: msg as any },
        );
      }
    } catch (e) {
      this.logger.error('Error handling message', e);
    } finally {
      if (this.sock) {
        await this.sock.sendPresenceUpdate('available', remoteJid);
      }
    }
  }

  private async resolveUser(phoneNumber: string, pushName?: string) {
    let user = await this.prisma.user.findUnique({ where: { phoneNumber } });
    if (!user) {
      user = await this.prisma.user.create({
        data: { phoneNumber, name: pushName || 'Unknown' },
      });
      this.logger.log(`Created new user for ${phoneNumber}`);
    }
    return user;
  }
}
