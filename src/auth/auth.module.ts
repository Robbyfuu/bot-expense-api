import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaService } from '../prisma.service';

import { JwtStrategy } from './jwt.strategy';

import { WhatsappModule } from '../whatsapp/whatsapp.module';

import { WebAuthnService } from './webauthn.service';
import { WebAuthnController } from './webauthn.controller';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => {
        if (!process.env.JWT_SECRET) {
          throw new Error('JWT_SECRET must be defined');
        }
        return {
          secret: process.env.JWT_SECRET,
          signOptions: { expiresIn: '1h' },
        };
      },
    }),
    WhatsappModule,
  ],
  controllers: [AuthController, WebAuthnController],
  providers: [AuthService, PrismaService, JwtStrategy, WebAuthnService],
  exports: [AuthService, JwtModule, WebAuthnService],
})
export class AuthModule {}
