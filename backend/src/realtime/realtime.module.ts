import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RealtimeEventsService } from './realtime.service';
import { RealtimeBus } from './realtime.bus';
import { RealtimeOutboxEvent } from './realtime-outbox.entity';
import { RealtimeController } from './realtime.controller';
import { Empleadas } from '../employees/entities/employee.entity';
import { Choferes } from '../drivers/entities/driver.entity';
import { Usuarios } from '../users/entities/user.entity';
import { Clientes } from '../clients/entities/client.entity';
import { Servicios } from '../services/entities/service.entity';
import { Viajes } from '../trips/entities/trip.entity';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Empleadas,
      Choferes,
      Usuarios,
      Clientes,
      Servicios,
      Viajes,
      RealtimeOutboxEvent,
    ]),
    AuthModule,
  ],
  controllers: [RealtimeController],
  providers: [RealtimeEventsService, RealtimeBus],
  exports: [RealtimeEventsService],
})
export class RealtimeModule {}
