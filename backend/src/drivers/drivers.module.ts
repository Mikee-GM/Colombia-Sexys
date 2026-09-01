import { Module, forwardRef } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriversService } from './drivers.service';
import { DriversController } from './drivers.controller';
import { DriverPortalController } from './driver-portal.controller';
import { Choferes } from './entities/driver.entity';
import { Usuarios } from '../users/entities/user.entity';
import { Viajes } from '../trips/entities/trip.entity';
import { Servicios } from '../services/entities/service.entity';
import { DisciplineModule } from '../discipline/discipline.module';
import { AuthModule } from '../auth/auth.module';
import { DriverTripsService } from './driver-trips.service';
import { TelegramModule } from '../telegram/telegram.module';
import { ServicesModule } from '../services/services.module';
import { TransportOperationsModule } from '../transport-operations/transport-operations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    LocationsModule,
    DisciplineModule,
    TypeOrmModule.forFeature([Choferes, Usuarios, Viajes, Servicios]),
    AuthModule,
    // Ambos con forwardRef: el avance de un viaje avisa por Telegram y arranca
    // el margen de espera del servicio, y esos dos modulos ya se referencian
    // entre si.
    forwardRef(() => TelegramModule),
    forwardRef(() => ServicesModule),
    TransportOperationsModule,
    NotificationsModule,
    AiModule,
  ],
  controllers: [DriversController, DriverPortalController],
  providers: [DriversService, DriverTripsService],
  exports: [DriversService, DriverTripsService],
})
export class DriversModule {}
