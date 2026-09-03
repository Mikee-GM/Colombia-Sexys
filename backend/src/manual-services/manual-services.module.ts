import { NotificationsModule } from '../notifications/notifications.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SolicitudServicioManual } from './entities/manual-service-request.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { Usuarios } from '../users/entities/user.entity';
import { Clientes } from '../clients/entities/client.entity';
import { Servicios } from '../services/entities/service.entity';
import { ManualServicesService } from './manual-services.service';
import { ManualServicesController } from './manual-services.controller';
import { RealtimeModule } from '../realtime/realtime.module';
import { LiquidationsModule } from '../liquidations/liquidations.module';
import { TransportOperationsModule } from '../transport-operations/transport-operations.module';

@Module({
  imports: [
    NotificationsModule,
    TypeOrmModule.forFeature([
      SolicitudServicioManual,
      Empleadas,
      Usuarios,
      Clientes,
      Servicios,
    ]),
    RealtimeModule,
    LiquidationsModule,
    // Los moteles habituales rellenan el desplegable de lugar del formulario.
    TransportOperationsModule,
  ],
  controllers: [ManualServicesController],
  providers: [ManualServicesService],
  exports: [ManualServicesService],
})
export class ManualServicesModule {}
