import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { Usuarios } from '../users/entities/user.entity';
import { ApiControllerDocs } from '../common/swagger/api-docs.decorators';
import { NotificationsService } from './notifications.service';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { WebPushProvider } from './web-push.provider';
import { RegistrarSuscripcionDto } from './dto/registrar-suscripcion.dto';
import { DarDeBajaDto } from './dto/dar-de-baja.dto';

/**
 * Avisos push del usuario que trae la sesion.
 *
 * No hay rutas por id ajeno, igual que en `user-preferences`: el sujeto es
 * siempre quien hace la peticion, asi que nadie puede suscribir ni dar de baja
 * el dispositivo de otro. Por eso tampoco lleva `@Roles`.
 *
 * `JwtAuthGuard` ya ejecuta el `CsrfGuard` por dentro, asi que las rutas que
 * mutan estado quedan cubiertas sin declararlo aparte.
 */
@Controller('push')
@ApiControllerDocs('push', true)
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly suscripciones: PushSubscriptionsService,
    private readonly webPush: WebPushProvider,
  ) {}

  /**
   * La clave que el navegador necesita para suscribirse.
   *
   * Se sirve desde aqui en vez de duplicarla en el entorno del frontend para
   * que exista una sola fuente: si las dos se desincronizan, la suscripcion se
   * crea igual y el envio falla despues, en silencio.
   */
  @Get('clave-publica')
  clavePublica(): { clavePublica: string; activo: boolean } {
    return {
      clavePublica: this.webPush.clavePublica(),
      activo: this.webPush.estaConfigurado(),
    };
  }

  @Post('suscripciones')
  @HttpCode(204)
  async suscribir(
    @Body() dto: RegistrarSuscripcionDto,
    @GetUser() actor: Usuarios,
    @Req() request: Request,
  ): Promise<void> {
    await this.suscripciones.registrar(
      actor.id,
      {
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
      },
      request.headers['user-agent']?.slice(0, 300),
    );
  }

  @Delete('suscripciones')
  @HttpCode(204)
  async darDeBaja(
    @Body() dto: DarDeBajaDto,
    @GetUser() actor: Usuarios,
  ): Promise<void> {
    await this.suscripciones.darDeBaja(actor.id, dto.endpoint);
  }

  /**
   * Aviso de prueba a los dispositivos de quien llama.
   *
   * No es un extra de desarrollo: es la unica forma de comprobar la cadena
   * entera sin esperar a que un cliente pida un servicio de verdad, y de
   * diagnosticar el telefono de alguien que dice que no le llega nada.
   */
  @Post('prueba')
  async prueba(@GetUser() actor: Usuarios): Promise<{ enviados: number }> {
    const enviados = await this.notifications.notificar(actor.id, {
      titulo: 'Aviso de prueba',
      cuerpo: 'Si ves esto, los avisos funcionan en este dispositivo.',
      // Cada rol tiene su pantalla: un aviso que lleva al panel del jefe desde
      // el telefono de una modelo la deja en una pagina a la que no entra.
      url: portalDeRol(actor.rol),
      tag: 'prueba',
    });
    return { enviados };
  }
}

/** A donde lleva tocar un aviso, segun quien lo recibe. */
export function portalDeRol(rol: string): string {
  if (rol === 'empleada') return '/empleada/portal';
  if (rol === 'chofer') return '/chofer/portal';
  return '/jefe';
}
