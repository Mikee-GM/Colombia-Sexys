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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SolicitudServicioManual,
      Empleadas,
      Usuarios,
      Clientes,
      Servicios,
    ]),
    RealtimeModule,
    LiquidationsModule,
  ],
  controllers: [ManualServicesController],
  providers: [ManualServicesService],
  exports: [ManualServicesService],
})
export class ManualServicesModule {}
