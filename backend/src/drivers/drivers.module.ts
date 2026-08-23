import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriversService } from './drivers.service';
import { DriversController } from './drivers.controller';
import { DriverPortalController } from './driver-portal.controller';
import { Choferes } from './entities/driver.entity';
import { Usuarios } from '../users/entities/user.entity';
import { Viajes } from '../trips/entities/trip.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Choferes, Usuarios, Viajes]), AuthModule],
  controllers: [DriversController, DriverPortalController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
