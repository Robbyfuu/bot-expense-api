/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma.service';
import { JwtService } from '@nestjs/jwt';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { EncryptionService } from '../common/security/encryption.service';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let whatsappService: WhatsappService;
  let jwtService: JwtService;
  let encryptionService: EncryptionService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
    },
  };

  const mockWhatsappService = {
    sendMessage: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockEncryptionService = {
    encrypt: jest.fn((text) => Promise.resolve(`enc:${text}`)),
    decrypt: jest.fn((text) => Promise.resolve(text.replace('enc:', ''))),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: WhatsappService, useValue: mockWhatsappService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: EncryptionService, useValue: mockEncryptionService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    whatsappService = module.get<WhatsappService>(WhatsappService);
    jwtService = module.get<JwtService>(JwtService);
    encryptionService = module.get<EncryptionService>(EncryptionService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendOtp', () => {
    it('should generate OTP and send it via WhatsApp if user exists', async () => {
      const phoneNumber = '56912345678';
      const mockUser = { id: '1', phoneNumber: '56912345678@s.whatsapp.net' };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(mockUser);

      const result = await service.sendOtp(phoneNumber);

      expect(mockPrismaService.user.findUnique).toHaveBeenCalledWith({
        where: { phoneNumber: `${phoneNumber}@s.whatsapp.net` },
      });
      // Verify encryption was called
      expect(mockEncryptionService.encrypt).toHaveBeenCalled();

      expect(mockPrismaService.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockUser.id },
          data: expect.objectContaining({
            otp: expect.stringMatching(/^enc:/), // Expect encrypted format from mock
          }),
        }),
      );

      expect(whatsappService.sendMessage).toHaveBeenCalledWith(
        expect.stringContaining(phoneNumber),
        expect.stringContaining('Tu código de verificación ExpenseBot es:'),
      );
      expect(result).toEqual({ message: 'OTP sent' });
    });

    it('should throw UnauthorizedException if user does not exist', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.sendOtp('56999999999')).rejects.toThrow(
        UnauthorizedException,
      );
      expect(whatsappService.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtp', () => {
    it('should return access token if OTP is valid and not expired', async () => {
      const phoneNumber = '56912345678';
      const validOtp = '123456';
      const encryptedOtp = `enc:${validOtp}`;
      const validExpiresAt = new Date(Date.now() + 10000); // Future date
      const mockUser = {
        id: '1',
        phoneNumber: '56912345678@s.whatsapp.net',
        otp: encryptedOtp, // Store as encrypted
        otpExpiresAt: validExpiresAt,
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(mockUser); // clear OTP
      mockJwtService.sign.mockReturnValue('mock_token');

      const result = await service.verifyOtp(phoneNumber, validOtp);

      expect(mockEncryptionService.decrypt).toHaveBeenCalledWith(encryptedOtp);
      expect(result).toHaveProperty('accessToken', 'mock_token');
      expect(result).toHaveProperty('refreshToken');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: mockUser.id },
        data: { otp: null, otpExpiresAt: null },
      });
    });

    it('should throw UnauthorizedException if OTP is incorrect', async () => {
      const phoneNumber = '56912345678';
      const mockUser = {
        id: '1',
        phoneNumber: '56912345678@s.whatsapp.net',
        otp: 'enc:123456',
        otpExpiresAt: new Date(Date.now() + 10000),
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.verifyOtp(phoneNumber, '000000')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if OTP is expired', async () => {
      const phoneNumber = '56912345678';
      const mockUser = {
        id: '1',
        phoneNumber: '56912345678@s.whatsapp.net',
        otp: 'enc:123456',
        otpExpiresAt: new Date(Date.now() - 1000), // Past date
      };

      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      await expect(service.verifyOtp(phoneNumber, '123456')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
