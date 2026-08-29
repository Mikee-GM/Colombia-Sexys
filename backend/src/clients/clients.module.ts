import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';
import { Clientes } from './entities/client.entity';
import { DisciplineModule } from '../discipline/discipline.module';
import { ClientDossierService } from './client-dossier.service';

@Module({
  imports: [TypeOrmModule.forFeature([Clientes]), DisciplineModule],
  controllers: [ClientsController],
  providers: [ClientsService, ClientDossierService],
  exports: [ClientsService, ClientDossierService],
})
export class ClientsModule {}
