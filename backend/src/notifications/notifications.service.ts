import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Servicios } from '../services/entities/service.entity';
import { PushSubscriptionsService } from './push-subscriptions.service';
import { WebPushProvider } from './web-push.provider';
import { UserPreferencesService } from '../user-preferences/user-preferences.service';
import { Usuarios } from '../users/entities/user.entity';
import {
  PushNotificationEvent,
  PushNotificationStatus,
} from './entities/push-notification-event.entity';

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
  /** Identificador estable del evento de negocio, si ya existe. */
  eventId?: string;
  /** Entidad relacionada para diagnostico, nunca viaja al navegador. */
  relatedEntityId?: string;
  /** Clave durable que vuelve idempotente el envio para este usuario. */
  dedupeKey?: string;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly webPush: WebPushProvider,
    private readonly suscripciones: PushSubscriptionsService,
    @InjectRepository(Servicios)
    private readonly servicios: Repository<Servicios>,
    @InjectRepository(PushNotificationEvent)
    private readonly eventos: Repository<PushNotificationEvent>,
    @InjectRepository(Usuarios)
    private readonly usuarios: Repository<Usuarios>,
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
    const eventId = aviso.eventId ?? randomUUID();
    const dedupeKey = aviso.dedupeKey ?? eventId;
    const reserva = await this.reservarEvento(
      usuarioId,
      aviso,
      eventId,
      dedupeKey,
    );
    // `null` significa que otra ejecucion ya reservo exactamente este evento.
    if (reserva === null) return 0;

    if (!this.webPush.estaConfigurado()) {
      await this.marcarEvento(reserva, 'skipped', 0);
      return 0;
    }
    if (aviso.tipo && !(await this.losQuiere(usuarioId, aviso.tipo))) {
      await this.marcarEvento(reserva, 'skipped', 0);
      return 0;
    }

    let destinos;
    try {
      destinos = await this.suscripciones.listarDe(usuarioId);
    } catch (error: unknown) {
      this.logger.error(
        `No se pudieron leer las suscripciones de ${usuarioId}: ${String(error)}`,
      );
      await this.marcarEvento(reserva, 'failed', 0);
      return 0;
    }
    if (destinos.length === 0) {
      await this.marcarEvento(reserva, 'skipped', 0);
      return 0;
    }

    const carga = {
      eventId,
      titulo: aviso.titulo,
      cuerpo: aviso.cuerpo,
      url: this.rutaSegura(aviso.url),
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
            return { enviado: true };
          case 'caducado':
            // El navegador dice que ese destino ya no existe. Se borra: si no,
            // la tabla se llena de destinos muertos y cada aviso paga la espera
            // de todos ellos.
            await this.suscripciones.olvidar(destino.endpoint);
            return { enviado: false };
          case 'error': {
            this.logger.warn(
              `Fallo el aviso push a ${destino.id}: ${resultado.motivo}`,
            );
            const fallos = await this.suscripciones.marcarFallo(destino.id);
            return {
              enviado: false,
              falloRepetido: fallos === 3 ? destino.id : undefined,
            };
          }
          case 'sin-configurar':
            return { enviado: false };
        }
      }),
    );

    const enviados = resultados.filter(
      (r) => r.status === 'fulfilled' && r.value.enviado,
    ).length;
    await this.marcarEvento(
      reserva,
      enviados > 0 ? 'sent' : 'failed',
      enviados,
    );
    if (aviso.tipo !== 'push_delivery_repeated_failure') {
      const fallosRepetidos = resultados.flatMap((resultado) =>
        resultado.status === 'fulfilled' && resultado.value.falloRepetido
          ? [resultado.value.falloRepetido]
          : [],
      );
      await Promise.allSettled(
        fallosRepetidos.map((subscriptionId) =>
          this.avisarAdminsDeFalloRepetido(subscriptionId),
        ),
      );
    }
    return enviados;
  }

  private async avisarAdminsDeFalloRepetido(
    subscriptionId: string,
  ): Promise<void> {
    try {
      const admins = await this.usuarios.find({
        where: { rol: 'admin', activo: true },
        select: { id: true },
      });
      const dia = new Date().toISOString().slice(0, 10);
      await Promise.allSettled(
        admins.map((admin) =>
          this.notificar(admin.id, {
            titulo: 'Error repetido de notificaciones',
            cuerpo: 'Un dispositivo requiere revision en la aplicacion.',
            url: '/admin/ajustes',
            tipo: 'push_delivery_repeated_failure',
            tag: 'fallo-push-repetido',
            dedupeKey: `admin:push-failure:${subscriptionId}:${dia}`,
          }),
        ),
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo avisar a administracion del fallo push repetido: ${String(error)}`,
      );
    }
  }

  /**
   * Reserva atomica del evento. `undefined` permite continuar si la bitacora
   * falla; `null` es un duplicado confirmado y por eso si detiene el envio.
   */
  private async reservarEvento(
    usuarioId: string,
    aviso: Aviso,
    eventId: string,
    dedupeKey: string,
  ): Promise<string | null | undefined> {
    try {
      const filas = (await this.eventos.query(
        `INSERT INTO push_notification_events
           (event_id, usuario_id, type, related_entity_id, dedupe_key)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (usuario_id, dedupe_key) DO NOTHING
         RETURNING id`,
        [
          eventId,
          usuarioId,
          aviso.tipo ?? 'operational',
          aviso.relatedEntityId ?? null,
          dedupeKey,
        ],
      )) as { id: string }[];
      return filas[0]?.id ?? null;
    } catch (error) {
      // La operacion principal ya ocurrio. Una bitacora caida no puede impedir
      // el aviso, aunque durante ese fallo no se pueda garantizar dedupe.
      this.logger.error(
        `No se pudo reservar el evento push ${dedupeKey}: ${String(error)}`,
      );
      return undefined;
    }
  }

  private async marcarEvento(
    id: string | undefined,
    status: PushNotificationStatus,
    deliveredCount: number,
  ): Promise<void> {
    if (!id) return;
    try {
      await this.eventos.update(
        { id },
        {
          status,
          deliveredCount,
          sentAt: status === 'sent' ? new Date() : null,
        },
      );
    } catch (error) {
      this.logger.warn(
        `No se pudo cerrar el evento push ${id}: ${String(error)}`,
      );
    }
  }

  /** Solo se permiten destinos internos; la sesion se valida al abrirlos. */
  private rutaSegura(url: string): string {
    return url.startsWith('/') && !url.startsWith('//') ? url : '/';
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
      relatedEntityId: servicio.id,
      dedupeKey: `service_requested:${servicio.id}`,
    });
  }
}
