/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { OpenAIService } from './openai.service';
import OpenAI from 'openai';

// Mock the OpenAI library
jest.mock('openai');

describe('OpenAIService', () => {
  let service: OpenAIService;
  let mockOpenAIInstance: any;

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    mockOpenAIInstance = {
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    };

    // Configure the mock constructor to return our mock instance
    (OpenAI as unknown as jest.Mock).mockImplementation(
      () => mockOpenAIInstance,
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [OpenAIService],
    }).compile();

    service = module.get<OpenAIService>(OpenAIService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processReceipt', () => {
    it('should successfully process a receipt image and return parsed JSON', async () => {
      process.env.OPENAI_API_KEY = 'test-key'; // Ensure key exists
      const mockResult = {
        item: 'Test Product',
        amount: 10000,
        merchant: 'Test Store',
        date: '2023-10-10',
        rut: '12345678-9',
      };

      mockOpenAIInstance.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify(mockResult),
            },
          },
        ],
      });

      const buffer = Buffer.from('fake-image-data');
      const result = await service.processReceipt(buffer, 'image/jpeg');

      expect(result).toEqual(mockResult);
      expect(mockOpenAIInstance.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4o',
          response_format: { type: 'json_object' },
        }),
      );
    });

    it('should throw error if OPENAI_API_KEY is not configured', async () => {
      delete process.env.OPENAI_API_KEY; // Temporarily delete
      const buffer = Buffer.from('fake-image-data');

      await expect(
        service.processReceipt(buffer, 'image/jpeg'),
      ).rejects.toThrow('OPENAI_API_KEY not configured');

      process.env.OPENAI_API_KEY = 'test-key'; // Restore
    });

    it('should handle empty response from OpenAI', async () => {
      mockOpenAIInstance.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: null,
            },
          },
        ],
      });

      const buffer = Buffer.from('fake-image-data');
      await expect(
        service.processReceipt(buffer, 'image/jpeg'),
      ).rejects.toThrow('Empty response from OpenAI');
    });
  });

  describe('parseCorrection', () => {
    it('should return parsed updates from natural language correction', async () => {
      const currentData = { amount: 5000, merchant: 'Wrong Store' };
      const correctionText = 'The amount is actually 6000';
      const mockUpdates = { amount: 6000 };

      mockOpenAIInstance.chat.completions.create.mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify(mockUpdates),
            },
          },
        ],
      });

      const result = await service.parseCorrection(currentData, correctionText);

      expect(result).toEqual(mockUpdates);
      expect(mockOpenAIInstance.chat.completions.create).toHaveBeenCalled();
    });

    it('should return empty object on error', async () => {
      mockOpenAIInstance.chat.completions.create.mockRejectedValue(
        new Error('API Error'),
      );
      const result = await service.parseCorrection({}, 'fix');
      expect(result).toEqual({});
    });
  });
});
