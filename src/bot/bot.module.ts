import { Module } from '@nestjs/common';
import { BotProcessorService } from './bot.processor';
import { OpenAIModule } from '../openai/openai.module';
import { PrismaService } from '../prisma.service';

@Module({
  imports: [OpenAIModule],
  providers: [BotProcessorService, PrismaService],
  exports: [BotProcessorService],
})
export class BotModule {}
