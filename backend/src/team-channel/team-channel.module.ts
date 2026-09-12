import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MensajesEquipo } from './entities/team-message.entity';
import { TeamChannelService } from './team-channel.service';
import { TeamChannelController } from './team-channel.controller';
import { Empleadas } from '../employees/entities/employee.entity';
import { Usuarios } from '../users/entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TelegramModule } from '../telegram/telegram.module';

/**
 * Canal empleada - jefe.
 *
 * El `forwardRef` a Telegram es el de siempre en este proyecto: el bot necesita
 * este servicio para los botones de responder y este necesita al bot para
 * entregar los mensajes.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([MensajesEquipo, Empleadas, Usuarios]),
    AuthModule,
    RealtimeModule,
    NotificationsModule,
    forwardRef(() => TelegramModule),
  ],
  controllers: [TeamChannelController],
  providers: [TeamChannelService],
  exports: [TeamChannelService],
})
export class TeamChannelModule {}
