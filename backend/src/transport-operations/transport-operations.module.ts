import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PresetServiceLocation } from './entities/preset-service-location.entity';
import { TransportSetting } from './entities/transport-setting.entity';
import { TransportOperationsController } from './transport-operations.controller';
import { TransportOperationsService } from './transport-operations.service';
import { EmployeeCashObligation } from './entities/employee-cash-obligation.entity';
import { EmployeeCashPayment, EmployeeCashPaymentAllocation } from './entities/employee-cash-payment.entity';
import { DriverSettlement } from './entities/driver-settlement.entity';
import { Viajes } from '../trips/entities/trip.entity';
import { SettlementsService } from './settlements.service';
import { Empleadas } from '../employees/entities/employee.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TransportSetting, PresetServiceLocation, EmployeeCashObligation, EmployeeCashPayment, EmployeeCashPaymentAllocation, DriverSettlement, Viajes, Empleadas])],
  controllers: [TransportOperationsController],
  providers: [TransportOperationsService, SettlementsService],
  exports: [TransportOperationsService, SettlementsService, TypeOrmModule],
})
export class TransportOperationsModule {}
