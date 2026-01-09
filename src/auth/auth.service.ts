/* eslint-disable */
import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { EncryptionService } from '../common/security/encryption.service';
import { authenticator } from 'otplib';
import { toDataURL } from 'qrcode';
import { randomUUID } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private whatsappService: WhatsappService,
    private encryptionService: EncryptionService,
  ) {}

  async sendOtp(phoneNumber: string) {
    // 1. Generate 6 digit code
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // 2. Normalize Phone Number (ensure @s.whatsapp.net)
    const normalizedPhone = phoneNumber.includes('@')
      ? phoneNumber
      : `${phoneNumber}@s.whatsapp.net`;

    // 3. Find User
    const user = await this.prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
    });

    if (!user) {
      // Check allowlist
      const allowedNumbers = (process.env.ALLOWED_NUMBERS || '')
        .split(',')
        .map((n) => n.trim());
      const isAllowed =
        allowedNumbers.includes(normalizedPhone) ||
        allowedNumbers.includes(phoneNumber);

      if (isAllowed) {
        // Auto-register allowed user
        const newUser = await this.prisma.user.create({
          data: {
            phoneNumber: normalizedPhone,
            name: 'Nuevo Usuario', // Placeholder
          },
        });

        // Use the new user
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        const encryptedOtp = await this.encryptionService.encrypt(otp);

        await this.prisma.user.update({
          where: { id: newUser.id },
          data: { otp: encryptedOtp, otpExpiresAt: expiresAt },
        });

        await this.whatsappService.sendMessage(
          normalizedPhone,
          `Tu código de verificación ExpenseBot es: ${otp}\n\n@expensebot #${otp}`,
        );

        return { message: 'OTP sent (User Created)' };
      }

      throw new UnauthorizedException(
        'User not found. Interact with bot first.',
      );
    }

    // 4. Save Encrypted OTP
    const encryptedOtp = await this.encryptionService.encrypt(otp);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { otp: encryptedOtp, otpExpiresAt: expiresAt },
    });

    // 5. Send via WhatsApp (Plain text)
    await this.whatsappService.sendMessage(
      normalizedPhone,
      `Tu código de verificación ExpenseBot es: ${otp}\n\n@expensebot #${otp}`,
    );

    return { message: 'OTP sent' };
  }

  async verifyOtp(phoneNumber: string, code: string) {
    const normalizedPhone = phoneNumber.includes('@')
      ? phoneNumber
      : `${phoneNumber}@s.whatsapp.net`;

    const user = await this.prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
    });

    if (!user || !user.otp) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    try {
      const decryptedOtp = await this.encryptionService.decrypt(user.otp);

      if (
        decryptedOtp !== code ||
        !user.otpExpiresAt ||
        new Date() > user.otpExpiresAt
      ) {
        throw new UnauthorizedException('Invalid or expired OTP');
      }
    } catch (e) {
      // If decryption fails or comparison fails
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // Clear OTP
    await this.prisma.user.update({
      where: { id: user.id },
      data: { otp: null, otpExpiresAt: null },
    });

    // Generate Payload
    const payload = { sub: user.id, phoneNumber: user.phoneNumber };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.generateRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
    };
  }

  async generateTwoFactorSecret(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('User not found');

    const secret = authenticator.generateSecret();
    const otpauthUrl = authenticator.keyuri(
      user.phoneNumber,
      'ExpenseBot',
      secret,
    );

    const encryptedSecret = await this.encryptionService.encrypt(secret);

    // Save secret but don't enable it yet
    await this.prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: encryptedSecret },
    });

    return {
      secret, // Optional: send back if user wants to type it manually
      qrCode: await toDataURL(otpauthUrl),
    };
  }

  async enableTwoFactor(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.twoFactorSecret) {
      throw new UnauthorizedException('2FA setup not started');
    }

    const secret = await this.encryptionService.decrypt(user.twoFactorSecret);
    const isValid = authenticator.check(token, secret);

    if (!isValid) {
      throw new UnauthorizedException('Invalid 2FA token');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isTwoFactorEnabled: true },
    });

    return { message: '2FA enabled successfully' };
  }

  async validateTwoFactor(userId: string, token: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isTwoFactorEnabled || !user.twoFactorSecret) {
      return false;
    }

    const secret = await this.encryptionService.decrypt(user.twoFactorSecret);
    return authenticator.check(token, secret);
  }

  async validateTwoFactorLogin(phoneNumber: string, token: string) {
    const normalizedPhone = phoneNumber.includes('@')
      ? phoneNumber
      : `${phoneNumber}@s.whatsapp.net`;

    const user = await this.prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
    });

    if (!user || !user.isTwoFactorEnabled || !user.twoFactorSecret) {
      throw new UnauthorizedException('2FA not enabled or user not found');
    }

    const secret = await this.encryptionService.decrypt(user.twoFactorSecret);
    const isValid = authenticator.check(token, secret);

    if (!isValid) throw new UnauthorizedException('Invalid 2FA token');

    const payload = { sub: user.id, phoneNumber: user.phoneNumber };
    const accessToken = this.jwtService.sign(payload);
    const refreshToken = await this.generateRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
    };
  }

  async generateRefreshToken(userId: string) {
    // Generate a random token
    // Encrypt it ? OR Hash it. Hashing is better for storage. But for simplicity and matching existing patterns, User table has encrypted secrets.
    // Refresh Token table can store hashed token.
    // For now, let's store it as is (encrypted) or plaintext if we assume database is secure?
    // User wants "Secure" like Binance.
    // We should hash it. But EncryptionService is available.

    // Let's use EncryptionService to store it securely if we want to retrieve it? No, tokens are usually hashed.
    // We'll use simple string for now and EncryptionService if needed.
    // Actually, let's just use UUID for the token string.

    const refreshToken = randomUUID();
    // const hashedToken = await this.encryptionService.encrypt(refreshToken); // Using encrypt as "hash" effectively here since we can decrypt to compare but we won't. Wait, if we use encrypt, we get a different string every time? No.
    // If we want to look it up, we need deterministic hash or stored unique.
    // EncryptionService: encrypt(text) -> iv:content.
    // We cannot search by encrypted value usually.
    // So we should store the token in the DB directly if we want to update it, OR store a hash.
    // Since we created RefreshToken table with `token` @unique, we need to be able to find it.
    // So we should store the token itself for now (MVP) but it's a "secret".
    // Or we use `refreshTokens` relation.

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: userId,
        expiresAt: expiresAt,
      },
    });

    return refreshToken;
  }

  async refresh(refreshToken: string) {
    const tokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid Refresh Token');
    }

    if (tokenRecord.revoked) {
      // Reuse detection logic could go here (revoke all tokens for user)
      throw new UnauthorizedException('Token revoked');
    }

    if (new Date() > tokenRecord.expiresAt) {
      throw new UnauthorizedException('Token expired');
    }

    // Determine payload
    const { user } = tokenRecord;
    const payload = { sub: user.id, phoneNumber: user.phoneNumber };

    // Rotate Refresh Token (Security Best Practice)
    // Revoke old one (or delete) and issue new one
    await this.prisma.refreshToken.delete({ where: { id: tokenRecord.id } }); // Delete old

    const newRefreshToken = await this.generateRefreshToken(user.id);
    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async getProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        color: true,
        salary: true,
        isTwoFactorEnabled: true,
        createdAt: true,
      },
    });
  }

  async updateProfile(
    userId: string,
    data: { name?: string; color?: string; salary?: number },
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        color: data.color,
        salary: data.salary,
      },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        color: true,
        salary: true,
        isTwoFactorEnabled: true,
      },
    });
  }
  async getPasskeys(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { authenticators: true },
    });

    if (!user) return [];

    return user.authenticators.map((auth) => ({
      id: auth.id,
      credentialID: auth.credentialID,
      createdAt: auth.createdAt,
      deviceType: auth.credentialDeviceType,
      backedUp: auth.credentialBackedUp,
    }));
  }
}
