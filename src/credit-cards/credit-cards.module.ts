import { Module } from '@nestjs/common';
import { CreditCardsController } from './credit-cards.controller';
import { CreditCardsService } from './credit-cards.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [CreditCardsController],
  providers: [CreditCardsService, PrismaService],
})
export class CreditCardsModule {}
