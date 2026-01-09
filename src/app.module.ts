import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';

import { ExpensesModule } from './expenses/expenses.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';

import { SecurityModule } from './common/security/security.module';

import { WhatsappModule } from './whatsapp/whatsapp.module';

import { ChatModule } from './chat/chat.module';
import { BotModule } from './bot/bot.module';
import { OpenAIModule } from './openai/openai.module';
import { CreditCardsModule } from './credit-cards/credit-cards.module';
import { CategoriesModule } from './categories/categories.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ExpensesModule,
    AuthModule,
    SecurityModule,
    WhatsappModule,
    ChatModule,
    BotModule,
    OpenAIModule,
    CreditCardsModule,
    CategoriesModule,
  ],
  controllers: [AppController],
  providers: [AppService, PrismaService],
  exports: [],
})
export class AppModule {}
