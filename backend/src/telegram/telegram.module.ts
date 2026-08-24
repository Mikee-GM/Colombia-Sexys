import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TelegrafModule } from 'nestjs-telegraf';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Context, session } from 'telegraf';
import { Repository } from 'typeorm';
import { TelegramService } from './telegram.service';
import { TelegramCryptoService } from './telegram-crypto.service';
import { TelegramBotRegistryService } from './telegram-bot-registry.service';
import { TelegramBotsController } from './telegram-bots.controller';
import { EmployeeTelegramBot } from './entities/employee-telegram-bot.entity';
import { TelegramAuthUpdate } from './telegram-auth.update';
import { TelegramBookingUpdate } from './telegram-booking.update';
import { TelegramDriverUpdate } from './telegram-driver.update';
import { TelegramAdminUpdate } from './telegram-admin.update';
import { TelegramBookingService } from './telegram-booking.service';
import { Usuarios } from '../users/entities/user.entity';
import { Clientes } from '../clients/entities/client.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { Servicios } from '../services/entities/service.entity';
import { AuthModule } from '../auth/auth.module';
import { ServicesModule } from '../services/services.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { TelegramSession } from './entities/telegram-session.entity';
import {
  buildSessionKey,
  type SessionKeyContext,
} from './telegram-session.key';
import { AiModule } from '../ai/ai.module';
import { Viajes } from '../trips/entities/trip.entity';

import { ExtrasCatalogo } from '../catalog-extras/entities/catalog-extra.entity';
import { ExtrasServicio } from '../service-extras/entities/service-extra.entity';
import { ConversacionesTelegram } from '../telegram-conversations/entities/telegram-conversation.entity';
import { AuthorizedBankAccounts } from '../services/entities/authorized-bank-account.entity';
import { PaymentReceiptValidations } from '../services/entities/payment-receipt-validation.entity';
import { EmployeeReportsModule } from '../employee-reports/employee-reports.module';
import { ExtensionsModule } from '../extensions/extensions.module';
import { TransportOperationsModule } from '../transport-operations/transport-operations.module';
import { EmployeeOnboardingModule } from '../employee-onboarding/employee-onboarding.module';
import { TelegramOnboardingService } from './telegram-onboarding.service';
import { TelegramOnboardingUpdate } from './telegram-onboarding.update';
import { TelegramOnboardingScheduler } from './telegram-onboarding.scheduler';
import { TelegramSessionMaintenance } from './telegram-session.maintenance';
import { DisciplineModule } from '../discipline/discipline.module';
import { GroupServicesModule } from '../group-services/group-services.module';
import { UploadModule } from '../upload/upload.module';
import { WeeklyContentModule } from '../weekly-content/weekly-content.module';
import { CandidateScreeningModule } from '../candidate-screening/candidate-screening.module';
import { TelegramSessionStore } from './telegram-session.store';
import { serializeBySessionKey } from './telegram-session.lock';
import { TelegramLinkAttempt } from './entities/telegram-link-attempt.entity';
import { TelegramLinkAttemptsService } from './telegram-link-attempts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Usuarios,
      Clientes,
      Empleadas,
      Servicios,
      ExtrasCatalogo,
      ExtrasServicio,
      TelegramSession,
      Viajes,
      ConversacionesTelegram,
      AuthorizedBankAccounts,
      PaymentReceiptValidations,
      EmployeeTelegramBot,
      TelegramLinkAttempt,
    ]),
    AuthModule,
    LoyaltyModule,
    AiModule,
    EmployeeOnboardingModule,
    forwardRef(() => ServicesModule),
    EmployeeReportsModule,
    ExtensionsModule,
    TransportOperationsModule,
    DisciplineModule,
    forwardRef(() => GroupServicesModule),
    UploadModule,
    forwardRef(() => WeeklyContentModule),
    CandidateScreeningModule,
    TelegrafModule.forRootAsync({
      imports: [ConfigModule, TypeOrmModule.forFeature([TelegramSession])],
      useFactory: (
        configService: ConfigService,
        sessionRepository: Repository<TelegramSession>,
      ) => {
        const token = configService.get<string>('TELEGRAM_BOT_TOKEN');
        if (!token) {
          throw new Error(
            'TELEGRAM_BOT_TOKEN is not defined in environment variables',
          );
        }
        // Cada bot dedicado necesita su propio hilo de conversación: sin este
        // prefijo, hablar con dos modelas distintas compartiría la misma
        // sesión. El bot central conserva el formato original de la clave para
        // no tumbar las conversaciones ya abiertas.
        //
        // La misma función la usan el cerrojo y la sesión: si divergieran, el
        // cerrojo estaría protegiendo una clave distinta de la que se escribe.
        const getSessionKey = (ctx: Context): string | undefined =>
          buildSessionKey(ctx as SessionKeyContext);

        const store = new TelegramSessionStore(sessionRepository);

        return {
          token,
          launchOptions:
            token.includes('dummy') ||
            token.includes('fake') ||
            token.startsWith('123456789')
              ? false
              : undefined,
          middlewares: [
            // Va antes de `session()` a propósito: el cerrojo tiene que
            // envolver también la lectura y la escritura de la sesión, no solo
            // el manejador. Dos updates del mismo cliente se procesan en fila.
            serializeBySessionKey(
              getSessionKey as (ctx: unknown) => string | undefined,
            ),
            session({ getSessionKey, store }),
          ],
        };
      },
      inject: [ConfigService, getRepositoryToken(TelegramSession)],
    }),
  ],
  controllers: [TelegramBotsController],
  providers: [
    TelegramService,
    TelegramCryptoService,
    TelegramLinkAttemptsService,
    TelegramBotRegistryService,
    TelegramAuthUpdate,
    TelegramBookingUpdate,
    TelegramDriverUpdate,
    TelegramAdminUpdate,
    TelegramBookingService,
    TelegramOnboardingService,
    TelegramOnboardingUpdate,
    TelegramOnboardingScheduler,
    TelegramSessionMaintenance,
  ],
  exports: [
    TelegramService,
    TelegrafModule,
    TelegramBookingService,
    TelegramBotRegistryService,
  ],
})
export class TelegramModule {}
