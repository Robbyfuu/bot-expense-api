import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  async create(
    userId: string,
    data: {
      amount: number;
      merchant: string;
      category: string;
      date: Date;
      paymentForCardId?: string;
      paidWithCardId?: string;
      status?: string;
    },
  ) {
    return this.prisma.expense.create({
      data: {
        userId,
        amount: data.amount,
        merchant: data.merchant,
        category: data.category,
        date: data.date,
        status: data.status || 'CONFIRMED',
        paymentForCardId: data.paymentForCardId,
        paidWithCardId: data.paidWithCardId,
      },
    });
  }

  async update(
    userId: string,
    expenseId: string,
    data: { paidWithCardId?: string; category?: string; amount?: number },
  ) {
    // Check if expense exists and belongs to user
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, userId },
    });

    if (!expense) throw new Error('Expense not found');

    return this.prisma.expense.update({
      where: { id: expenseId },
      data: {
        ...data,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.expense.findMany({
      where: { userId },
      orderBy: {
        date: 'desc',
      },
      include: {
        user: {
          select: {
            name: true,
            phoneNumber: true,
          },
        },
      },
    });
  }

  async getChartData(userId: string, month?: number, year?: number) {
    const where: Prisma.ExpenseWhereInput = { userId, status: 'CONFIRMED' };

    const now = new Date();
    const targetYear = year || now.getFullYear();
    const targetMonth = month ? month - 1 : now.getMonth(); // 0-indexed

    if (year || month) {
      // If filtering, set strict range
      const startDate = new Date(targetYear, targetMonth, 1);
      const endDate = new Date(targetYear, targetMonth + 1, 0, 23, 59, 59);
      where.date = { gte: startDate, lte: endDate };
      // Exclude credit card purchases (deferred) from monthly cash flow
      where.paidWithCardId = null;

      // If only year is requested (and no specific month), adjust range to full year
      if (year && !month) {
        const startYear = new Date(year, 0, 1);
        const endYear = new Date(year, 11, 31, 23, 59, 59);
        where.date = { gte: startYear, lte: endYear };
      }
    } else {
      // Default: Last 30 days? Or Current Month?
      // User asked for "filter by month/year", implying default might be current context.
      // Let's stick to Current Month as default view unless specified.
      // Actually previous implementation was "all time".
      // Let's defaulting to "Current Month" makes sense for a dashboard.
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
      );
      where.date = { gte: startDate, lte: endDate };
      where.paidWithCardId = null;
    }

    const expenses = await this.prisma.expense.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    // Group by Date -> Category -> Sum
    const groupedData: Record<string, Record<string, number>> = {};
    const categories = new Set<string>();

    expenses.forEach((expense) => {
      const dateKey = expense.date.toISOString().split('T')[0]; // YYYY-MM-DD
      if (!groupedData[dateKey]) {
        groupedData[dateKey] = {};
      }
      const category = expense.category || 'Otros';
      categories.add(category);
      groupedData[dateKey][category] =
        (groupedData[dateKey][category] || 0) + expense.amount;
    });

    // Format for Recharts
    const chartData = Object.keys(groupedData).map((date) => ({
      date,
      ...groupedData[date],
    }));

    // Generate Config with dynamic colors
    const chartConfig: Record<string, { label: string; color: string }> = {};
    let colorIndex = 1;
    categories.forEach((cat) => {
      chartConfig[cat] = {
        label: cat,
        color: `hsl(var(--chart-${colorIndex}))`,
      };
      colorIndex = (colorIndex % 5) + 1; // Cycle through chart-1 to chart-5
    });

    return { chartData, chartConfig };
  }
}
