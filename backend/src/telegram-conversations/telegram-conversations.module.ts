import { forwardRef, Module } from '@nestjs/common';
import { TelegramConversationsService } from './telegram-conversations.service';
import { TelegramConversationsController } from './telegram-conversations.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversacionesTelegram } from './entities/telegram-conversation.entity';
import { Servicios } from '../services/entities/service.entity';
import { TelegramSession } from '../telegram/entities/telegram-session.entity';
import { Clientes } from '../clients/entities/client.entity';
import { TelegramModule } from '../telegram/telegram.module';
import { CustomerBookingSession } from './entities/customer-booking-session.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { ServicesModule } from '../services/services.module';
import { TelegramMessageDeletionScheduler } from './telegram-message-deletion.scheduler';
import { TelegramConversationPhotoController } from './telegram-conversation-photo.controller';
import { TelegramConversationPhotoService } from './telegram-conversation-photo.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConversacionesTelegram,
      Servicios,
      TelegramSession,
      Clientes,
      CustomerBookingSession,
      Empleadas,
    ]),
    forwardRef(() => TelegramModule),
    forwardRef(() => ServicesModule),
  ],
  controllers: [
    TelegramConversationsController,
    TelegramConversationPhotoController,
  ],
  providers: [
    TelegramConversationsService,
    TelegramMessageDeletionScheduler,
    TelegramConversationPhotoService,
  ],
  exports: [TelegramConversationsService],
})
export class TelegramConversationsModule {}
