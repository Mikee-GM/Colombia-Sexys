import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Servicios } from '../services/entities/service.entity';
import { PushSubscription } from './entities/push-subscription.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { WebPushProvider } from './web-push.provider';
import { NotificationsBridge } from './notifications.bridge';
import { UserPreferencesModule } from '../user-preferences/user-preferences.module';
import { PushNotificationEvent } from './entities/push-notification-event.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { Choferes } from '../drivers/entities/driver.entity';
import { Usuarios } from '../users/entities/user.entity';

/**
 * La salida de avisos del sistema.
 *
 * Se exporta el `NotificationsService` y no el proveedor de push: quien avisa
 * pide "notifica esto a este usuario" y no elige el canal. Hoy solo hay uno,
 * pero la costura ya esta puesta para que añadir otro no obligue a recorrer los
 * mas de cien puntos que avisan repartidos por el backend.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      PushSubscription,
      PushNotificationEvent,
      Servicios,
      Empleadas,
      Choferes,
      Usuarios,
    ]),
    AuthModule,
    UserPreferencesModule,
  ],
  controllers: [NotificationsController],
  providers: [
    WebPushProvider,
    PushSubscriptionsService,
    NotificationsService,
    NotificationsBridge,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
