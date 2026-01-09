/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    sendOtp: jest.fn(),
    verifyOtp: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should call authService.sendOtp', async () => {
      const phoneNumber = '1234567890';
      await controller.login({ phoneNumber });
      expect(authService.sendOtp).toHaveBeenCalledWith(phoneNumber);
    });
  });

  describe('verify', () => {
    it('should call authService.verifyOtp', async () => {
      const phoneNumber = '1234567890';
      const code = '123456';
      await controller.verify({ phoneNumber, code });
      expect(authService.verifyOtp).toHaveBeenCalledWith(phoneNumber, code);
    });
  });
});
