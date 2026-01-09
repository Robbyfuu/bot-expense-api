import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthService } from './auth.service';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { AuthenticatorTransport } from '@simplewebauthn/server';
/* eslint-disable */
import { JwtService } from '@nestjs/jwt';
import {
  WebAuthnVerifyDto,
  WebAuthnLoginVerifyDto,
} from './dto/webauthn-verify.dto';

@Injectable()
export class WebAuthnService {
  private rpName = 'Expense Bot';
  private rpID = process.env.WEBAUTHN_RP_ID || 'localhost';
  private origin = (
    process.env.WEBAUTHN_ORIGIN ||
    'http://localhost:3000,http://localhost:5173,https://localhost:5173'
  ).split(',');

  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private jwtService: JwtService,
  ) {}

  async generateRegistrationOptions(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { authenticators: true },
    });

    if (!user) throw new UnauthorizedException('User not found');

    const options = await generateRegistrationOptions({
      rpName: this.rpName,
      rpID: this.rpID,
      userID: new Uint8Array(Buffer.from(user.id)),
      userName: user.phoneNumber, // or user.email/name
      attestationType: 'none',
      excludeCredentials: user.authenticators.map((authenticator) => ({
        id: authenticator.credentialID,
        type: 'public-key',
        transports: authenticator.transports
          ? (JSON.parse(authenticator.transports) as AuthenticatorTransport[])
          : undefined,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
        authenticatorAttachment: 'platform', // Prefer FaceID/TouchID
      },
    });

    // Save challenge
    await this.prisma.user.update({
      where: { id: userId },
      data: { currentChallenge: options.challenge },
    });

    return options;
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

  async verifyRegistration(userId: string, body: WebAuthnVerifyDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.currentChallenge) {
      throw new BadRequestException('Challenge not found');
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body as any,
        expectedChallenge: user.currentChallenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
      });
    } catch (error) {
      console.error(error);
      throw new BadRequestException(error.message);
    }

    const { verified, registrationInfo } = verification;
    console.log('WebAuthn Registration Verification:', {
      verified,
      registrationInfo,
    });

    if (verified && registrationInfo) {
      const { credential, credentialDeviceType, credentialBackedUp } =
        registrationInfo;

      const {
        id: credentialID,
        publicKey: credentialPublicKey,
        counter,
      } = credential;

      if (!credentialPublicKey) {
        console.error('Error: credentialPublicKey is missing');
        throw new BadRequestException(
          'Registration failed: missing public key',
        );
      }

      // Save authenticator
      await this.prisma.authenticator.create({
        data: {
          credentialID, // Already base64url string in new simplewebauthn versions usually, or we ensure it.
          credentialPublicKey:
            Buffer.from(credentialPublicKey).toString('base64url'),
          counter: BigInt(counter),
          credentialDeviceType,
          credentialBackedUp,
          userId: user.id,
          transports: body.response.transports
            ? JSON.stringify(body.response.transports)
            : null,
        },
      });

      // Clear challenge
      await this.prisma.user.update({
        where: { id: userId },
        data: { currentChallenge: null },
      });

      return { verified: true };
    }

    throw new BadRequestException('Verification failed');
  }

  async generateAuthenticationOptions(phoneNumber: string) {
    // Normalize phone
    const normalizedPhone = phoneNumber.includes('@')
      ? phoneNumber
      : `${phoneNumber}@s.whatsapp.net`;
    const user = await this.prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
      include: { authenticators: true },
    });

    if (!user) {
      // Allow passkey login for unknown users? No, they must exist.
      throw new UnauthorizedException('User not found');
    }

    const options = await generateAuthenticationOptions({
      rpID: this.rpID,
      allowCredentials: user.authenticators.map((authenticator) => ({
        id: authenticator.credentialID,
        type: 'public-key',
        transports: authenticator.transports
          ? (JSON.parse(authenticator.transports) as AuthenticatorTransport[])
          : undefined,
      })),
      userVerification: 'preferred',
    });

    // Save challenge
    await this.prisma.user.update({
      where: { id: user.id },
      data: { currentChallenge: options.challenge },
    });

    return options;
  }

  async verifyAuthentication(
    phoneNumber: string,
    body: WebAuthnLoginVerifyDto,
  ) {
    const normalizedPhone = phoneNumber.includes('@')
      ? phoneNumber
      : `${phoneNumber}@s.whatsapp.net`;
    const user = await this.prisma.user.findUnique({
      where: { phoneNumber: normalizedPhone },
      include: { authenticators: true },
    });

    if (!user || !user.currentChallenge) {
      throw new BadRequestException('Challenge not found or user not found');
    }

    // Find the authenticator used
    const authenticator = user.authenticators.find(
      (auth) => auth.credentialID === body.id,
    );
    if (!authenticator) {
      throw new UnauthorizedException('Authenticator not found');
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: body as any,
        expectedChallenge: user.currentChallenge,
        expectedOrigin: this.origin,
        expectedRPID: this.rpID,
        credential: {
          id: authenticator.credentialID,
          publicKey: new Uint8Array(
            Buffer.from(authenticator.credentialPublicKey, 'base64url'),
          ),
          counter: Number(authenticator.counter),
          transports: authenticator.transports
            ? JSON.parse(authenticator.transports)
            : undefined,
        },
      });
    } catch (error) {
      throw new BadRequestException(error.message);
    }

    const { verified, authenticationInfo } = verification;

    if (verified) {
      // Update counter
      await this.prisma.authenticator.update({
        where: { id: authenticator.id },
        data: {
          counter: BigInt(authenticationInfo.newCounter),
        },
      });

      // Clear challenge
      await this.prisma.user.update({
        where: { id: user.id },
        data: { currentChallenge: null },
      });

      // Issue Tokens
      const refreshToken = await this.authService.generateRefreshToken(user.id);
      const accessToken = this.jwtService.sign({
        sub: user.id,
        phoneNumber: user.phoneNumber,
      }); // Access jwtService via authService (or inject JwtService here)

      return {
        verified: true,
        accessToken,
        refreshToken,
      };
    }
    throw new BadRequestException('Verification failed');
  }
}
