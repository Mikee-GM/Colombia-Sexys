import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Empleadas } from '../employees/entities/employee.entity';
import { LiquidationAudit } from './entities/liquidation-audit.entity';
import { LiquidationDebt } from './entities/liquidation-debt.entity';
import { LiquidationPayment } from './entities/liquidation-payment.entity';
import { LiquidationRecord } from './entities/liquidation-record.entity';
import { LiquidationsController } from './liquidations.controller';
import { LiquidationsRepository } from './liquidations.repository';
import { LiquidationsService } from './liquidations.service';
import { Servicios } from '../services/entities/service.entity';
import { OfficeLiquidationSyncService } from './office-liquidation-sync.service';
import { EmployeeCashObligation } from '../transport-operations/entities/employee-cash-obligation.entity';
import {
  EmployeeCashPayment,
  EmployeeCashPaymentAllocation,
} from '../transport-operations/entities/employee-cash-payment.entity';
import { EmployeeWeeklySettlement } from './entities/employee-weekly-settlement.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Empleadas,
      LiquidationRecord,
      LiquidationDebt,
      LiquidationPayment,
      LiquidationAudit,
      EmployeeCashObligation,
      EmployeeCashPayment,
      EmployeeCashPaymentAllocation,
      EmployeeWeeklySettlement,
      Servicios,
    ]),
  ],
  controllers: [LiquidationsController],
  providers: [
    LiquidationsService,
    LiquidationsRepository,
    OfficeLiquidationSyncService,
  ],
  exports: [LiquidationsService, OfficeLiquidationSyncService],
})
export class LiquidationsModule {}
