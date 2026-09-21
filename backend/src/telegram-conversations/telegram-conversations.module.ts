import { forwardRef, Module } from '@nestjs/common';
import { TelegramConversationsService } from './telegram-conversations.service';
import { TelegramConversationsController } from './telegram-conversations.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversacionesTelegram } from './entities/telegram-conversation.entity';
import { Servicios } from '../services/entities/service.entity';
import { TelegramSession } from '../telegram/entities/telegram-session.entity';
import { Clientes } from '../clients/entities/client.entity';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ConversacionesTelegram, Servicios, TelegramSession, Clientes]),
    forwardRef(() => TelegramModule),
  ],
  controllers: [TelegramConversationsController],
  providers: [TelegramConversationsService],
  exports: [TelegramConversationsService],
})
export class TelegramConversationsModule {}
