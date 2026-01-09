import { Test, TestingModule } from '@nestjs/testing';
import { BotProcessorService } from './bot.processor';
import { PrismaService } from '../prisma.service';
import { OpenAIService } from '../openai/openai.service';
import { Logger } from '@nestjs/common';
import { DteService } from '../dte/dte.service';

describe('BotProcessorService', () => {
  let service: BotProcessorService;

  const mockPrisma = {
    expense: {
      findFirst: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    merchant: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    creditCard: {
      findMany: jest.fn(),
    },
  };

  const mockOpenAI = {
    processReceipt: jest.fn(),
    parseCorrection: jest.fn(),
  };

  const mockDte = {
    decode: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotProcessorService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: OpenAIService, useValue: mockOpenAI },
        { provide: DteService, useValue: mockDte },
      ],
    }).compile();

    service = module.get<BotProcessorService>(BotProcessorService);

    // Silence logger
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processText', () => {
    it('should confirm expense when user says "si"', async () => {
      const mockPending = {
        id: 'exp1',
        merchant: 'TestStore',
        userId: 'user1',
      };
      const mockFinal = {
        id: 'exp1',
        amount: 1000,
        date: new Date(),
        merchant: 'TestStore',
        category: 'Food',
        merchantRel: null,
      };

      mockPrisma.expense.findFirst.mockResolvedValue(mockPending);
      mockPrisma.expense.update.mockResolvedValue({});
      mockPrisma.expense.findUnique.mockResolvedValue(mockFinal);

      const response = await service.processText('user1', 'si');

      expect(mockPrisma.expense.update).toHaveBeenCalledWith({
        where: { id: 'exp1' },
        data: { status: 'CONFIRMED' },
      });
      expect(response).toContain('✅ *Gasto Guardado Exitosamente*');
    });

    it('should reject expense when user says "no"', async () => {
      const mockPending = {
        id: 'exp1',
        merchant: 'TestStore',
        userId: 'user1',
      };

      mockPrisma.expense.findFirst.mockResolvedValue(mockPending);
      mockPrisma.expense.update.mockResolvedValue({});

      const response = await service.processText('user1', 'no');

      expect(mockPrisma.expense.update).toHaveBeenCalledWith({
        where: { id: 'exp1' },
        data: { status: 'REJECTED' },
      });
      expect(response).toContain('❌ Gasto descartado');
    });

    it('should handle correction correction', async () => {
      const mockPending = {
        id: 'exp1',
        merchant: 'TestStore',
        userId: 'user1',
      };
      const mockUpdated = {
        id: 'exp1',
        merchant: 'NewStore',
        amount: 5000,
        category: 'Food',
      };

      mockPrisma.expense.findFirst.mockResolvedValue(mockPending);
      mockOpenAI.parseCorrection.mockResolvedValue({ merchant: 'NewStore' });
      mockPrisma.expense.update.mockResolvedValue({});
      mockPrisma.merchant.findMany.mockResolvedValue([]); // No candidates found
      mockPrisma.expense.findUnique.mockResolvedValue(mockUpdated);

      const response = await service.processText('user1', 'Es NewStore');

      expect(mockOpenAI.parseCorrection).toHaveBeenCalledWith(
        mockPending,
        'Es NewStore',
      );
      expect(mockPrisma.expense.update).toHaveBeenCalled();
      expect(response).toContain('✏️ *Gasto Actualizado*');
      expect(response).toContain('NewStore');
    });
  });
});
