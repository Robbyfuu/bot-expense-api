import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class CreditCardsService {
  constructor(private prisma: PrismaService) {}

  async create(
    userId: string,
    data: {
      name: string;
      last4: string;
      closingDay: number;
      paymentDay: number;
    },
  ) {
    return this.prisma.creditCard.create({
      data: {
        ...data,
        userId,
      },
    });
  }

  async findAll(userId: string) {
    return this.prisma.creditCard.findMany({
      where: { userId },
    });
  }

  async findOne(id: string) {
    return this.prisma.creditCard.findUnique({
      where: { id },
    });
  }

  async remove(userId: string, id: string) {
    // Ensure user owns the card
    const card = await this.prisma.creditCard.findFirst({
      where: { id, userId },
    });

    if (card) {
      return this.prisma.creditCard.delete({
        where: { id },
      });
    }
  }
}
