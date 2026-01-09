/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { ExpensesService } from './expenses.service';
import { PrismaService } from '../prisma.service';

describe('ExpensesService', () => {
  let service: ExpensesService;
  let prisma: PrismaService;

  const mockPrismaService = {
    expense: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpensesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findAll', () => {
    it('should return an array of expenses for a specific user', async () => {
      const userId = 'user-123';
      const mockExpenses = [
        { id: 1, amount: 1000, merchant: 'Test Merchant', userId: userId },
        { id: 2, amount: 2000, merchant: 'Test Merchant 2', userId: userId },
      ];

      mockPrismaService.expense.findMany.mockResolvedValue(mockExpenses);

      const result = await service.findAll(userId);

      expect(result).toBe(mockExpenses);
      expect(prisma.expense.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { date: 'desc' },
        include: {
          user: {
            select: {
              name: true,
              phoneNumber: true,
            },
          },
        },
      });
    });
  });
});
