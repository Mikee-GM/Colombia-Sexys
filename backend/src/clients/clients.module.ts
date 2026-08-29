import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { Clientes } from './entities/client.entity';
import { DisciplineModule } from '../discipline/discipline.module';

@Module({
  imports: [TypeOrmModule.forFeature([Clientes]), DisciplineModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService],
})
export class ClientsModule {}
