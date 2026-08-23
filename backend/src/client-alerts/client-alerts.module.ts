import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertasClientes } from './entities/client-alert.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AlertasClientes])],
  exports: [TypeOrmModule],
})
export class ClientAlertsModule {}
