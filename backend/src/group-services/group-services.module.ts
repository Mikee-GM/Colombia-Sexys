import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DisciplineModule } from '../discipline/discipline.module';
import { Empleadas } from '../employees/entities/employee.entity';
import { Servicios } from '../services/entities/service.entity';
import { Viajes } from '../trips/entities/trip.entity';
import { GroupServicesController } from './group-services.controller';
import { GroupServicesService } from './group-services.service';
import { GroupServiceRequest } from './entities/group-service-request.entity';
import { GroupServiceRequestSelection } from './entities/group-service-request-selection.entity';
import { ServiceGroupAudit } from './entities/service-group-audit.entity';
import { ServiceParticipant } from './entities/service-participant.entity';
import { ServicePayment } from './entities/service-payment.entity';
import { TripPassenger } from './entities/trip-passenger.entity';
import { TelegramModule } from '../telegram/telegram.module';
import { LiquidationsModule } from '../liquidations/liquidations.module';
import { ServicesModule } from '../services/services.module';
import { GroupBossAssignmentService } from './group-boss-assignment.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GroupServiceRequest,
      GroupServiceRequestSelection,
      ServiceParticipant,
      ServicePayment,
      ServiceGroupAudit,
      TripPassenger,
      Servicios,
      Empleadas,
      Viajes,
    ]),
    DisciplineModule,
    forwardRef(() => TelegramModule),
    LiquidationsModule,
    forwardRef(() => ServicesModule),
  ],
  controllers: [GroupServicesController],
  providers: [GroupServicesService, GroupBossAssignmentService],
  exports: [GroupServicesService, GroupBossAssignmentService, TypeOrmModule],
})
export class GroupServicesModule {}
