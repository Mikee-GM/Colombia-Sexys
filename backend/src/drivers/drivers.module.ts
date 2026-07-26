import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriversService } from './drivers.service';
import { DriversController } from './drivers.controller';
import { Choferes } from './entities/driver.entity';
import { Usuarios } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Choferes, Usuarios])],
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
