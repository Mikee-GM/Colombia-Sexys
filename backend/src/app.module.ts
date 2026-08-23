import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard';
import { TelegramModule } from './telegram/telegram.module';
import { UsersModule } from './users/users.module';
import { AiModule } from './ai/ai.module';
import { DriversModule } from './drivers/drivers.module';
import { ClientsModule } from './clients/clients.module';
import { EmployeesModule } from './employees/employees.module';
import { ServicesModule } from './services/services.module';
import { CatalogExtrasModule } from './catalog-extras/catalog-extras.module';
import { ExtensionsModule } from './extensions/extensions.module';
import { TelegramConversationsModule } from './telegram-conversations/telegram-conversations.module';
import { EmployeePhotosModule } from './employee-photos/employee-photos.module';
import { AuthModule } from './auth/auth.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ApartmentsModule } from './apartments/apartments.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { UploadModule } from './upload/upload.module';
import { EmployeeReportsModule } from './employee-reports/employee-reports.module';
import { LiquidationsModule } from './liquidations/liquidations.module';
import { TransportOperationsModule } from './transport-operations/transport-operations.module';
import { EmployeeOnboardingModule } from './employee-onboarding/employee-onboarding.module';
import { DisciplineModule } from './discipline/discipline.module';
import { GroupServicesModule } from './group-services/group-services.module';
import { WeeklyContentModule } from './weekly-content/weekly-content.module';
import { CandidateScreeningModule } from './candidate-screening/candidate-screening.module';
import { ChallengesModule } from './challenges/challenges.module';
import { DriverShiftsModule } from './driver-shifts/driver-shifts.module';
import { ClientAlertsModule } from './client-alerts/client-alerts.module';
import { ServiceExtensionsModule } from './service-extensions/service-extensions.module';

@Module({
  imports: [
    AiModule,
    UploadModule,
    AuthModule,
    RealtimeModule,
    LoyaltyModule,
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        NODE_ENV: Joi.string()
          .valid('development', 'test', 'production')
          .default('development'),
        PORT: Joi.number().port().default(4000),
        WEB_URL: Joi.string().uri().required(),
        DATABASE_HOST: Joi.string().required(),
        DATABASE_PORT: Joi.number().default(5432),
        DATABASE_USER: Joi.string().required(),
        DATABASE_PASSWORD: Joi.string().required(),
        DATABASE_NAME: Joi.string().required(),
        JWT_SECRET: Joi.string().min(32).required(),
        JWT_REFRESH_SECRET: Joi.string()
          .min(32)
          .required()
          .invalid(Joi.ref('JWT_SECRET')),
        COOKIE_SECRET: Joi.string().min(32).required(),
        AUTH_COOKIE_DOMAIN: Joi.string().allow('').optional(),
        AUTH_COOKIE_SAME_SITE: Joi.string().valid('lax', 'none').default('lax'),
        TELEGRAM_BOT_TOKEN: Joi.string().required(),
        TELEGRAM_PROVIDER_TOKEN: Joi.string().allow('').optional(),
        // Opcional a propósito: sin ella el sistema arranca igual y sigue
        // funcionando con el bot central. Solo hace falta para poder vincular
        // bots dedicados a las modelos.
        TELEGRAM_TOKEN_ENCRYPTION_KEY: Joi.string()
          .min(32)
          .allow('')
          .optional(),
        TELEGRAM_WEBHOOK_BASE_URL: Joi.string().uri().allow('').optional(),
        // Cuantas instancias del backend se arrancan. Solo se usa para impedir
        // una combinacion que rompe el bot en silencio: con long polling, dos
        // procesos pidiendo getUpdates sobre el mismo token hacen que Telegram
        // devuelva 409 y uno de los dos deje de recibir mensajes.
        APP_INSTANCE_COUNT: Joi.number().integer().min(1).default(1),
        DEFAULT_ADMIN_EMAIL: Joi.string().email().required(),
        DEFAULT_ADMIN_PASSWORD: Joi.string().min(12).required(),
        R2_ENDPOINT: Joi.string().uri().required(),
        R2_ACCESS_KEY_ID: Joi.string().required(),
        R2_SECRET_ACCESS_KEY: Joi.string().required(),
        R2_BUCKET_NAME: Joi.string().required(),
        R2_PUBLIC_URL: Joi.string().uri().required(),
        GROQ_API_KEY: Joi.string().allow('').optional(),
        // Modelos y temperatura configurables: cuando el proveedor retira una
        // version del modelo hay que poder cambiarla sin tocar el codigo.
        AI_CHAT_MODEL: Joi.string().allow('').optional(),
        AI_VISION_MODEL: Joi.string().allow('').optional(),
        AI_CHAT_TEMPERATURE: Joi.number().min(0).max(2).allow('').optional(),
        XAI_API_KEY: Joi.string().allow('').optional(),
        BANK_ACCOUNT_DETAILS: Joi.string().allow('').optional(),
        MAX_DAILY_AI_CALLS: Joi.number().default(15),
        SCHEDULE_TRAVEL_SPEED_KMH: Joi.number().positive().default(25),
        SCHEDULE_PREPARATION_MINUTES: Joi.number().min(0).default(10),
        DRIVER_DISPATCH_RANKING_BAND_KM: Joi.number().positive().default(1.5),
        DISCIPLINE_LOW_SCORE_SUSPENSION_THRESHOLD: Joi.number()
          .min(0)
          .max(100)
          .default(20),
        ONBOARDING_SCAN_INTERVAL_MS: Joi.number()
          .integer()
          .min(10_000)
          .default(60_000),
        ONBOARDING_REMINDER_HOURS: Joi.number().positive().default(3),
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DATABASE_HOST'),
        port: configService.get<number>('DATABASE_PORT'),
        username: configService.get<string>('DATABASE_USER'),
        password: configService.get<string>('DATABASE_PASSWORD'),
        database: configService.get<string>('DATABASE_NAME'),
        // Con autoLoadEntities basta: cada modulo registra las suyas con
        // forFeature. El glob explicito ademas incluia `*.entity.ts`, que en
        // desarrollo con ts-node podia registrar la misma entidad dos veces.
        autoLoadEntities: true,
        synchronize: false, // Regla Heavy DB: no sincronización automática en producción/desarrollo estructurado, usar migraciones.
        migrationsRun: false,
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        extra: {
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        },
      }),
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
    ]),
    TelegramModule,
    UsersModule,
    DriversModule,
    ClientsModule,
    EmployeesModule,
    ServicesModule,
    CatalogExtrasModule,
    ExtensionsModule,
    TelegramConversationsModule,
    EmployeePhotosModule,
    ApartmentsModule,
    EmployeeReportsModule,
    LiquidationsModule,
    TransportOperationsModule,
    EmployeeOnboardingModule,
    DisciplineModule,
    GroupServicesModule,
    WeeklyContentModule,
    CandidateScreeningModule,
    ChallengesModule,
    DriverShiftsModule,
    ClientAlertsModule,
    ServiceExtensionsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Sin este guard global el ThrottlerModule no aplica a nada: quedaba
    // configurado pero inerte, y el login admitia intentos ilimitados. Se usa
    // la variante que se salta los contextos no-HTTP para no romper los
    // handlers de Telegram, que pasan por este mismo pipeline.
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
  ],
})
export class AppModule {}
