import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { Servicios } from './entities/service.entity';
import { Viajes } from '../trips/entities/trip.entity';
import { Choferes } from '../drivers/entities/driver.entity';
import { Usuarios } from '../users/entities/user.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { Clientes } from '../clients/entities/client.entity';
import { ExtrasCatalogo } from '../catalog-extras/entities/catalog-extra.entity';
import { ExtrasServicio } from '../service-extras/entities/service-extra.entity';
import { ServiceParticipant } from '../group-services/entities/service-participant.entity';
import { TelegramSession } from '../telegram/entities/telegram-session.entity';
import { TelegramModule } from '../telegram/telegram.module';
import { AiModule } from '../ai/ai.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { LiquidationsModule } from '../liquidations/liquidations.module';
import { TransportOperationsModule } from '../transport-operations/transport-operations.module';
import { ConversacionesTelegram } from '../telegram-conversations/entities/telegram-conversation.entity';
import { AuthorizedBankAccounts } from './entities/authorized-bank-account.entity';
import { PaymentReceiptValidations } from './entities/payment-receipt-validation.entity';
import { DisciplineModule } from '../discipline/discipline.module';
import { UploadModule } from '../upload/upload.module';
import { ExtensionsModule } from '../extensions/extensions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ServiceOperationsService } from './operations/service-operations.service';
import { ServiceOperationEvent } from './operations/entities/service-operation-event.entity';
import { ExtensionesServicio } from '../service-extensions/entities/service-extension.entity';
import { ServiceAdminAudit } from './entities/service-admin-audit.entity';
import { LiquidationRecord } from '../liquidations/entities/liquidation-record.entity';
import { EmployeeCashObligation } from '../transport-operations/entities/employee-cash-obligation.entity';
import { ServiceHistoryService } from './service-history.service';
import { ServiceHistoryController } from './service-history.controller';
import { AdminServiceLifecycleService } from './admin-service-lifecycle.service';
import { AdminServiceLifecycleController } from './admin-service-lifecycle.controller';

import { GodEyeService } from './god-eye.service';
import { GodEyeController } from './god-eye.controller';

import { ServiceScheduleScheduler } from './service-schedule.scheduler';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Servicios,
      Viajes,
      Choferes,
      Usuarios,
      ConversacionesTelegram,
      AuthorizedBankAccounts,
      PaymentReceiptValidations,
      // Los tres los usa el cierre de un servicio por la empleada: liberarla,
      // avisar a quien la esperaba y dejar registro de la cuenta final.
      Empleadas,
      Clientes,
      TelegramSession,
      ExtrasCatalogo,
      ExtrasServicio,
      ServiceParticipant,
      ServiceOperationEvent,
      ExtensionesServicio,
      ServiceAdminAudit,
      LiquidationRecord,
      EmployeeCashObligation,
    ]),
    forwardRef(() => TelegramModule),
    AiModule,
    LoyaltyModule,
    LiquidationsModule,
    TransportOperationsModule,
    DisciplineModule,
    UploadModule,
    NotificationsModule,
    ExtensionsModule,
  ],
  controllers: [
    ServicesController,
    GodEyeController,
    ServiceHistoryController,
    AdminServiceLifecycleController,
  ],
  providers: [
    ServicesService,
    ServiceOperationsService,
    GodEyeService,
    ServiceScheduleScheduler,
    ServiceHistoryService,
    AdminServiceLifecycleService,
  ],
  exports: [ServicesService, ServiceOperationsService, GodEyeService],
})
export class ServicesModule {}
