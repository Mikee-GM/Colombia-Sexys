import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RealtimeEventsService } from '../realtime/realtime.service';
import type { RealtimeMessage } from '../realtime/realtime.bus';
import { NotificationsService } from './notifications.service';

/** Como se describe un aviso derivado de un evento del sistema. */
type AvisoDeEvento = {
  titulo: string;
  cuerpo: string;
  url: string;
  /** Prefijo del `tag`, para que dos avisos del mismo asunto no se apilen. */
  asunto: string;
  /**
   * Cuando el evento solo justifica un aviso a veces.
   *
   * `chat_message` se emite tambien por cada respuesta de la IA y por cada nota
   * del sistema: sin filtrar, una conversacion normal seria una lluvia de
   * avisos por algo que el jefe no tiene que atender.
   */
  soloSi?: (evento: Record<string, unknown>) => boolean;
};

/**
 * Avisos de nivel 2 que salen de un evento dirigido al jefe.
 *
 * Solo eventos del canal `boss`: los eventos en vivo de este sistema son de
 * panel, no de persona, asi que casi todo lo que se emite va dirigido al jefe.
 * Los avisos de la modelo y del chofer siguen enganchados donde ocurren, que es
 * el unico sitio donde se sabe a quien tocan.
 *
 * NO estan aqui los que ya se mandan a mano, o saldrian dos veces:
 * `service_requested`, `no_drivers_available`, `return_transport_escalated` y
 * `group_service_hold_expired`. Antes de añadir uno, comprobar que nadie mas lo
 * mande.
 */
const AVISOS_DEL_JEFE: Record<string, AvisoDeEvento> = {
  service_requests_competing: {
    titulo: 'Dos clientes por la misma modelo',
    cuerpo: 'Hay solicitudes que compiten. Toca para decidir.',
    url: '/jefe',
    asunto: 'compiten',
  },
  group_service_request_created: {
    titulo: 'Nuevo servicio grupal',
    cuerpo: 'Un cliente pidió un grupo. Toca para organizarlo.',
    url: '/jefe?tab=grupos',
    asunto: 'grupo',
  },
  manual_service_requested: {
    titulo: 'Registro a mano por aprobar',
    cuerpo: 'Una modelo pide registrar un servicio.',
    url: '/jefe/servicios-manuales',
    asunto: 'registro',
  },
  chat_message: {
    titulo: 'El cliente escribió',
    cuerpo: 'Hay un mensaje nuevo en una conversación tuya.',
    url: '/jefe',
    asunto: 'mensaje',
    // Solo lo que escribe el cliente. Las respuestas de la IA y las notas del
    // sistema van al mismo evento y no son algo que el jefe tenga que atender.
    soloSi: (evento) =>
      (evento.data as { emisor?: string } | undefined)?.emisor === 'cliente',
  },
  group_chat_message: {
    titulo: 'El cliente escribió',
    cuerpo: 'Hay un mensaje nuevo en un servicio grupal tuyo.',
    url: '/jefe?tab=grupos',
    asunto: 'mensaje-grupo',
    soloSi: (evento) =>
      (evento.data as { emisor?: string } | undefined)?.emisor === 'cliente',
  },
  service_cancelled: {
    titulo: 'Servicio cancelado',
    cuerpo: 'Se canceló un servicio de tu equipo.',
    url: '/jefe',
    asunto: 'cancelado',
  },
};

/**
 * Convierte eventos del sistema en avisos push.
 *
 * Existe porque enganchar cada aviso a mano ya salio mal varias veces: uno
 * quedo en un metodo por el que el camino real no pasaba, otro dentro de una
 * rama que solo cubria las citas programadas, y ninguno de los dos fallo de
 * forma visible. Un evento, en cambio, se emite en el punto donde el estado
 * cambia de verdad.
 *
 * Todo lo que sale de aqui es de nivel 2 --conviene enterarse, pero nada se
 * rompe si tarda-- y por eso viaja con su `tipo`, que es lo que hace que
 * `NotificationsService` consulte los ajustes de la persona antes de mandarlo.
 * Los de nivel 1 siguen enganchados en su sitio y no pasan por aqui: van sin
 * `tipo` y no deben poder apagarse.
 */
@Injectable()
export class NotificationsBridge implements OnModuleInit {
  private readonly logger = new Logger(NotificationsBridge.name);

  constructor(
    private readonly realtime: RealtimeEventsService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.realtime.onLocalDispatch((message) => {
      void this.alEvento(message);
    });
  }

  private async alEvento(message: RealtimeMessage): Promise<void> {
    // El jefe es el unico canal cuya clave ya es un id de usuario; los demas
    // guardan el id de empleada o de chofer, que no sirve para avisar.
    if (message.target !== 'boss' || !message.key) return;

    const tipo = (message.event as { type?: string } | undefined)?.type;
    if (!tipo) return;

    const aviso = AVISOS_DEL_JEFE[tipo];
    if (!aviso) return;
    if (
      aviso.soloSi &&
      !aviso.soloSi(message.event as Record<string, unknown>)
    ) {
      return;
    }

    try {
      await this.notifications.notificar(message.key, {
        titulo: aviso.titulo,
        cuerpo: aviso.cuerpo,
        url: aviso.url,
        tag: `${aviso.asunto}-${this.referencia(message.event)}`,
        tipo,
      });
    } catch (err) {
      this.logger.error(`Error avisando del evento ${tipo}:`, err);
    }
  }

  /**
   * Algo estable con lo que agrupar los avisos del mismo asunto.
   *
   * Sin esto, diez mensajes de la misma conversacion son diez avisos apilados
   * en la pantalla de bloqueo.
   */
  private referencia(event: unknown): string {
    const data = (event as { data?: Record<string, unknown> } | undefined)
      ?.data;
    /*
     * El orden importa: `id` va el ultimo a proposito. En un `chat_message` el
     * `id` es el del mensaje, asi que agrupar por el convertiria una
     * conversacion de diez mensajes en diez avisos apilados. `servicioId` --en
     * espanol, como la columna-- los junta todos en uno que se va reemplazando.
     */
    for (const clave of [
      'serviceId',
      'servicioId',
      'requestId',
      'tripId',
      'id',
    ]) {
      const valor = data?.[clave];
      // Solo lo que de verdad identifica algo: un objeto acabaria como
      // "[object Object]" y agruparia avisos que no tienen nada que ver.
      if (typeof valor === 'string' || typeof valor === 'number') {
        return String(valor);
      }
    }
    return 'general';
  }
}
