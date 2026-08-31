import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';

/** Lo que el navegador necesita para descifrar un aviso. */
export type DestinoPush = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

/**
 * Resultado de un envio, ya interpretado.
 *
 * `caducado` es el unico caso que exige actuar: el servicio de push dice que
 * ese destino ya no existe y hay que borrarlo. Se distingue aqui, y no en quien
 * llama, para que el resto del sistema no tenga que conocer los codigos de
 * estado del protocolo.
 */
export type ResultadoEnvio =
  | { estado: 'enviado' }
  | { estado: 'caducado' }
  | { estado: 'error'; motivo: string }
  | { estado: 'sin-configurar' };

/**
 * Unico punto del backend que habla con el paquete `web-push`.
 *
 * Mismo criterio que `AiProviderService` con el SDK de IA: la logica de negocio
 * pide "avisa a este destino" y no sabe nada del protocolo ni de la libreria.
 *
 * Sin claves VAPID el canal queda inactivo en vez de romper el arranque. Un
 * entorno de desarrollo sin configurar tiene que poder levantar el backend, y
 * un aviso que no sale es un problema menor que un backend que no arranca. Se
 * registra una sola vez para que no se pierda entre el ruido pero tampoco lo
 * inunde.
 */
@Injectable()
export class WebPushProvider implements OnModuleInit {
  private readonly logger = new Logger(WebPushProvider.name);
  private clavePublicaVapid = '';
  private configurado = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const publica = this.configService
      .get<string>('VAPID_PUBLIC_KEY', '')
      .trim();
    const privada = this.configService
      .get<string>('VAPID_PRIVATE_KEY', '')
      .trim();
    const sujeto = this.configService.get<string>('VAPID_SUBJECT', '').trim();

    if (!publica || !privada || !sujeto) {
      this.logger.warn(
        'Sin claves VAPID: los avisos push quedan inactivos. Define ' +
          'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY y VAPID_SUBJECT para activarlos.',
      );
      return;
    }

    try {
      webpush.setVapidDetails(sujeto, publica, privada);
      this.clavePublicaVapid = publica;
      this.configurado = true;
    } catch (error: unknown) {
      // Claves mal formadas: mismo trato que no tenerlas, pero el motivo
      // importa porque aqui el fallo es una errata, no una omision.
      this.logger.error(
        `Claves VAPID invalidas, los avisos push quedan inactivos: ${String(error)}`,
      );
    }
  }

  estaConfigurado(): boolean {
    return this.configurado;
  }

  /** La clave que el navegador necesita para suscribirse. */
  clavePublica(): string {
    return this.clavePublicaVapid;
  }

  async enviar(
    destino: DestinoPush,
    carga: Record<string, unknown>,
  ): Promise<ResultadoEnvio> {
    if (!this.configurado) return { estado: 'sin-configurar' };

    try {
      await webpush.sendNotification(
        {
          endpoint: destino.endpoint,
          keys: { p256dh: destino.p256dh, auth: destino.auth },
        },
        JSON.stringify(carga),
        // Si el telefono esta apagado, que el servicio de push lo guarde una
        // hora. Mas alla de eso el aviso ya no sirve: el servicio que esperaba
        // autorizacion hace rato que se resolvio de otra forma.
        { TTL: 3600 },
      );
      return { estado: 'enviado' };
    } catch (error: unknown) {
      const codigo = (error as { statusCode?: number })?.statusCode;
      /*
       * 404 y 410 son la forma que tiene el navegador de decir que esa
       * suscripcion ya no existe: el usuario revoco el permiso, borro los datos
       * del sitio o desinstalo la aplicacion. No es un fallo transitorio y
       * reintentarlo no la va a resucitar.
       */
      if (codigo === 404 || codigo === 410) return { estado: 'caducado' };
      return { estado: 'error', motivo: String(error) };
    }
  }
}
