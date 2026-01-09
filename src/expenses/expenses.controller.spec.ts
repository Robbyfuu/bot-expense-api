/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

describe('ExpensesController', () => {
  let controller: ExpensesController;
  let expensesService: ExpensesService;

  const mockExpensesService = {
    findAll: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExpensesController],
      providers: [{ provide: ExpensesService, useValue: mockExpensesService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: jest.fn(() => true) })
      .compile();

    controller = module.get<ExpensesController>(ExpensesController);
    expensesService = module.get<ExpensesService>(ExpensesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call expensesService.findAll with userId from request', async () => {
      const mockRequest = {
        user: { userId: 'user-id' },
      };
      await controller.findAll(mockRequest);
      expect(expensesService.findAll).toHaveBeenCalledWith('user-id');
    });
  });
});
