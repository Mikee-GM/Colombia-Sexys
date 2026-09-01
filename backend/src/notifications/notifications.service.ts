import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Servicios } from '../services/entities/service.entity';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { WebPushProvider } from './web-push.provider';
import { UserPreferencesService } from '../user-preferences/user-preferences.service';

/**
 * Un aviso, descrito por lo que significa y no por como se envia.
 *
 * Quien lo emite no sabe si saldra por push, por Telegram o por los dos: esa
 * decision vive aqui dentro. Es lo que permite añadir canales sin volver a
 * tocar los puntos que avisan, que hoy pasan del centenar.
 */
export type Aviso = {
  titulo: string;
  cuerpo: string;
  /** Ruta interna a la que lleva tocar el aviso. */
  url: string;
  /** Agrupa avisos del mismo asunto: el nuevo reemplaza al anterior. */
  tag?: string;
  /** Mantiene el aviso en pantalla hasta que alguien lo toca (Android). */
  requireInteraction?: boolean;
  /**
   * Que clase de aviso es, si se puede apagar desde los ajustes.
   *
   * Sin `tipo` el aviso sale siempre: es lo correcto para los de nivel 1, que
   * no deben poder silenciarse. Los de nivel 2 lo declaran y entonces se
   * consulta la preferencia de la persona. Vive aqui y no en cada punto que
   * avisa porque ya hubo un aviso que se colgo de un camino por el que el flujo
   * real no pasaba: cuanto menos haya que recordar en el sitio de la llamada,
   * mejor.
   */
  tipo?: string;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly webPush: WebPushProvider,
    private readonly suscripciones: PushSubscriptionsService,
    @InjectRepository(Servicios)
    private readonly servicios: Repository<Servicios>,
    private readonly preferences: UserPreferencesService,
  ) {}

  /**
   * Manda el aviso a todos los dispositivos del usuario.
   *
   * Nunca lanza. Un aviso que falla no puede tumbar la operacion que lo
   * origino: el servicio ya esta creado y el problema es que alguien no se
   * entere, no que haya que deshacerlo.
   *
   * Devuelve a cuantos dispositivos llego, que es lo unico que quien llama
   * podria querer registrar.
   */
  async notificar(usuarioId: string, aviso: Aviso): Promise<number> {
    if (!this.webPush.estaConfigurado()) return 0;
    if (aviso.tipo && !(await this.losQuiere(usuarioId, aviso.tipo))) return 0;

    let destinos;
    try {
      destinos = await this.suscripciones.listarDe(usuarioId);
    } catch (error: unknown) {
      this.logger.error(
        `No se pudieron leer las suscripciones de ${usuarioId}: ${String(error)}`,
      );
      return 0;
    }
    if (destinos.length === 0) return 0;

    const carga = {
      titulo: aviso.titulo,
      cuerpo: aviso.cuerpo,
      url: aviso.url,
      ...(aviso.tag ? { tag: aviso.tag } : {}),
      ...(aviso.requireInteraction ? { requireInteraction: true } : {}),
    };

    // En paralelo y con allSettled: un telefono que no responde no puede
    // retrasar ni impedir el aviso a los demas.
    const resultados = await Promise.allSettled(
      destinos.map(async (destino) => {
        const resultado = await this.webPush.enviar(destino, carga);
        switch (resultado.estado) {
          case 'enviado':
            await this.suscripciones.marcarEnvio(destino.id);
            return true;
          case 'caducado':
            // El navegador dice que ese destino ya no existe. Se borra: si no,
            // la tabla se llena de destinos muertos y cada aviso paga la espera
            // de todos ellos.
            await this.suscripciones.olvidar(destino.endpoint);
            return false;
          case 'error':
            this.logger.warn(
              `Fallo el aviso push a ${destino.id}: ${resultado.motivo}`,
            );
            await this.suscripciones.marcarFallo(destino.id);
            return false;
          case 'sin-configurar':
            return false;
        }
      }),
    );

    return resultados.filter((r) => r.status === 'fulfilled' && r.value).length;
  }

  /**
   * Si esta persona quiere recibir esta clase de aviso.
   *
   * Sin ajuste guardado se manda: quien nunca ha tocado sus preferencias espera
   * que la aplicacion le avise, no lo contrario. Y si la consulta falla tambien
   * se manda, porque perder un aviso es peor que mandar uno de mas.
   */
  private async losQuiere(usuarioId: string, tipo: string): Promise<boolean> {
    try {
      const ajuste = await this.preferences.get(usuarioId, 'avisos');
      if (!ajuste) return true;
      return ajuste[tipo] !== false;
    } catch {
      return true;
    }
  }

  /**
   * Avisa al jefe de que tiene un servicio esperando su autorizacion.
   *
   * El texto no lleva nombre del cliente, nombre artistico, lugar ni importe a
   * proposito. El aviso se muestra en la pantalla de bloqueo, a la vista de
   * quien este al lado del telefono, y ademas atraviesa los servidores de
   * Google o Apple. El detalle vive detras del toque, donde ya hay sesion.
   */
  async notificarJefeServicioPendiente(servicioId: string): Promise<void> {
    const servicio = await this.servicios.findOne({
      where: { id: servicioId },
      select: { id: true, jefeId: true },
    });
    if (!servicio) return;

    await this.notificar(servicio.jefeId, {
      titulo: 'Servicio pendiente de autorizar',
      cuerpo: 'Toca para revisarlo en el panel.',
      url: '/jefe',
      tag: `servicio-${servicio.id}`,
      requireInteraction: true,
    });
  }
}
