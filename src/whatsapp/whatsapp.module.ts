import { Module } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import { PrismaService } from '../prisma.service';
import { BotModule } from '../bot/bot.module';

@Module({
  imports: [BotModule],
  providers: [WhatsappService, PrismaService],
  exports: [WhatsappService],
})
export class WhatsappModule {}
