import { Module } from '@nestjs/common';
import { BotProcessorService } from './bot.processor';
import { OpenAIModule } from '../openai/openai.module';
import { PrismaService } from '../prisma.service';

import { DteModule } from '../dte/dte.module';

@Module({
  imports: [OpenAIModule, DteModule],
  providers: [BotProcessorService, PrismaService],
  exports: [BotProcessorService],
})
export class BotModule {}
