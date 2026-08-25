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
import { EmployeeMoneyService } from './employee-money.service';
import { Servicios } from '../services/entities/service.entity';
import { OfficeLiquidationSyncService } from './office-liquidation-sync.service';
import { EmployeeCashObligation } from '../transport-operations/entities/employee-cash-obligation.entity';
import {
  EmployeeCashPayment,
  EmployeeCashPaymentAllocation,
} from '../transport-operations/entities/employee-cash-payment.entity';
import { EmployeeWeeklySettlement } from './entities/employee-weekly-settlement.entity';
import { TransportOperationsModule } from '../transport-operations/transport-operations.module';

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
    /*
     * Deshacer la liquidacion semanal tiene que revertir el abono de efectivo
     * que creo la confirmacion, y esa logica —con sus asignaciones por
     * obligacion— vive en SettlementsService. Transporte no importa este
     * modulo, asi que la dependencia va en un solo sentido.
     */
    TransportOperationsModule,
  ],
  controllers: [LiquidationsController],
  providers: [
    LiquidationsService,
    EmployeeMoneyService,
    LiquidationsRepository,
    OfficeLiquidationSyncService,
  ],
  exports: [LiquidationsService, EmployeeMoneyService, OfficeLiquidationSyncService],
})
export class LiquidationsModule {}
