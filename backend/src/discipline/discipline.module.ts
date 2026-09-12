import { NotificationsModule } from '../notifications/notifications.module';
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RealtimeModule } from '../realtime/realtime.module';
import { DisciplineController } from './discipline.controller';
import { DisciplineService } from './discipline.service';
import { ConductReport } from './entities/conduct-report.entity';
import { DisciplinarySanction } from './entities/disciplinary-sanction.entity';
import { InteractionRating } from './entities/interaction-rating.entity';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [
    NotificationsModule,
    TypeOrmModule.forFeature([
      InteractionRating,
      ConductReport,
      DisciplinarySanction,
    ]),
    RealtimeModule,
    // El aviso a quien fue reportado sale tambien por el chat, y Telegram
    // importa este modulo para levantar reportes desde el bot: circulo que los
    // dos lados rompen con forwardRef.
    forwardRef(() => TelegramModule),
  ],
  controllers: [DisciplineController],
  providers: [DisciplineService],
  exports: [DisciplineService],
})
export class DisciplineModule {}
