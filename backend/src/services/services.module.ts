import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { Servicios } from './entities/service.entity';
import { Viajes } from '../trips/entities/trip.entity';
import { Choferes } from '../drivers/entities/driver.entity';
import { Usuarios } from '../users/entities/user.entity';
import { TelegramModule } from '../telegram/telegram.module';
import { AiModule } from '../ai/ai.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { LiquidationsModule } from '../liquidations/liquidations.module';
import { TransportOperationsModule } from '../transport-operations/transport-operations.module';
import { ConversacionesTelegram } from '../telegram-conversations/entities/telegram-conversation.entity';
import { AuthorizedBankAccounts } from './entities/authorized-bank-account.entity';
import { PaymentReceiptValidations } from './entities/payment-receipt-validation.entity';
import { DisciplineModule } from '../discipline/discipline.module';

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
    ]),
    forwardRef(() => TelegramModule),
    AiModule,
    LoyaltyModule,
    LiquidationsModule,
    TransportOperationsModule,
    DisciplineModule,
  ],
  controllers: [ServicesController],
  providers: [ServicesService],
  exports: [ServicesService],
})
export class ServicesModule {}
