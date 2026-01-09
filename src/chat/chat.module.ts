import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { BotModule } from '../bot/bot.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [BotModule, AuthModule],
  providers: [ChatGateway],
})
export class ChatModule {}
