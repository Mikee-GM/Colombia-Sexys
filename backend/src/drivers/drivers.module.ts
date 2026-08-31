import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriversService } from './drivers.service';
import { DriversController } from './drivers.controller';
import { DriverPortalController } from './driver-portal.controller';
import { Choferes } from './entities/driver.entity';
import { Usuarios } from '../users/entities/user.entity';
import { Viajes } from '../trips/entities/trip.entity';
import { AuthModule } from '../auth/auth.module';
import { DriverTripsService } from './driver-trips.service';
import { TelegramModule } from '../telegram/telegram.module';
import { ServicesModule } from '../services/services.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Choferes, Usuarios, Viajes]),
    AuthModule,
    // Ambos con forwardRef: el avance de un viaje avisa por Telegram y arranca
    // el margen de espera del servicio, y esos dos modulos ya se referencian
    // entre si.
    forwardRef(() => TelegramModule),
    forwardRef(() => ServicesModule),
  ],
  controllers: [DriversController, DriverPortalController],
  providers: [DriversService, DriverTripsService],
  exports: [DriversService, DriverTripsService],
})
export class DriversModule {}
