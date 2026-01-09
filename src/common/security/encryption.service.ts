import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
} from 'node:crypto';
import { promisify } from 'node:util';

@Injectable()
export class EncryptionService implements OnModuleInit {
  private key: Buffer;
  // TODO: Move to .env
  private readonly password = process.env.ENCRYPTION_PASSWORD;
  private readonly salt = process.env.ENCRYPTION_SALT;

  async onModuleInit() {
    if (!this.password || !this.salt) {
      throw new Error(
        'ENCRYPTION_PASSWORD and ENCRYPTION_SALT must be defined in environment variables',
      );
    }
    this.key = (await promisify(scrypt)(
      this.password,
      this.salt,
      32,
    )) as Buffer;
  }

  async encrypt(text: string): Promise<string> {
    await Promise.resolve();
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-ctr', this.key, iv);

    const encryptedText = Buffer.concat([cipher.update(text), cipher.final()]);

    // Format: iv:encrypted (hex)
    return `${iv.toString('hex')}:${encryptedText.toString('hex')}`;
  }

  async decrypt(text: string): Promise<string> {
    await Promise.resolve();
    const [ivHex, encryptedHex] = text.split(':');
    if (!ivHex || !encryptedHex) {
      throw new Error('Invalid encrypted format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const encryptedText = Buffer.from(encryptedHex, 'hex');

    const decipher = createDecipheriv('aes-256-ctr', this.key, iv);
    const decryptedText = Buffer.concat([
      decipher.update(encryptedText),
      decipher.final(),
    ]);

    return decryptedText.toString();
  }
}
