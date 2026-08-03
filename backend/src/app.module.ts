import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import * as Joi from 'joi';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TelegramModule } from './telegram/telegram.module';
import { UsersModule } from './users/users.module';
import { AiModule } from './ai/ai.module';
import { DriversModule } from './drivers/drivers.module';
import { ClientsModule } from './clients/clients.module';
import { EmployeesModule } from './employees/employees.module';
import { ServicesModule } from './services/services.module';
import { ServiceExtensionsModule } from './service-extensions/service-extensions.module';
import { CatalogExtrasModule } from './catalog-extras/catalog-extras.module';
import { ServiceExtrasModule } from './service-extras/service-extras.module';
import { ExtensionsModule } from './extensions/extensions.module';
import { TripsModule } from './trips/trips.module';
import { ClientAlertsModule } from './client-alerts/client-alerts.module';
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
        DEFAULT_ADMIN_EMAIL: Joi.string().email().required(),
        DEFAULT_ADMIN_PASSWORD: Joi.string().min(12).required(),
        R2_ENDPOINT: Joi.string().uri().required(),
        R2_ACCESS_KEY_ID: Joi.string().required(),
        R2_SECRET_ACCESS_KEY: Joi.string().required(),
        R2_BUCKET_NAME: Joi.string().required(),
        R2_PUBLIC_URL: Joi.string().uri().required(),
        GROQ_API_KEY: Joi.string().allow('').optional(),
        BANK_ACCOUNT_DETAILS: Joi.string().allow('').optional(),
        MAX_DAILY_AI_CALLS: Joi.number().default(15),
        SCHEDULE_TRAVEL_SPEED_KMH: Joi.number().positive().default(25),
        SCHEDULE_PREPARATION_MINUTES: Joi.number().min(0).default(10),
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
        autoLoadEntities: true,
        entities: [
          __dirname + '/**/*.entity.js',
          __dirname + '/**/*.entity.ts',
        ],
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
    ServiceExtensionsModule,
    CatalogExtrasModule,
    ServiceExtrasModule,
    ExtensionsModule,
    TripsModule,
    ClientAlertsModule,
    TelegramConversationsModule,
    EmployeePhotosModule,
    ApartmentsModule,
    EmployeeReportsModule,
    LiquidationsModule,
    TransportOperationsModule,
    EmployeeOnboardingModule,
    DisciplineModule,
    GroupServicesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
