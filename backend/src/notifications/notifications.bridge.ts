import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RealtimeEventsService } from '../realtime/realtime.service';
import type { RealtimeMessage } from '../realtime/realtime.bus';
import { NotificationsService } from './notifications.service';
import { Empleadas } from '../employees/entities/employee.entity';
import { Choferes } from '../drivers/entities/driver.entity';
import { Usuarios } from '../users/entities/user.entity';

/**
 * Un texto del aviso, fijo o derivado del evento.
 *
 * Casi todos los avisos dicen siempre lo mismo, pero hay eventos que llevan
 * dentro varios sucesos distintos --`trip_status_updated` vale igual para "va
 * en camino" que para "ya llegó"-- y un texto unico ahi no le dice al jefe lo
 * que ha pasado.
 */
type Texto = string | ((evento: Record<string, unknown>) => string);

/** Como se describe un aviso derivado de un evento del sistema. */
type AvisoDeEvento = {
  titulo: Texto;
  cuerpo: Texto;
  url: string;
  /** Prefijo del `tag`, para que dos avisos del mismo asunto no se apilen. */
  asunto: string;
  /** Los avisos urgentes no pueden apagarse desde preferencias. */
  urgente?: boolean;
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
  /*
   * Lo que escribe una modelo por el canal de dudas.
   *
   * Es de nivel 2 --conviene enterarse, pero nada se rompe si tarda-- y por eso
   * sale por aqui y se puede silenciar. Lo que la modelo recibe cuando le
   * escriben a ella va enganchado en el propio canal, que es el unico sitio
   * donde se sabe a quien toca.
   */
  team_channel_message: {
    titulo: 'Mensaje de una modelo',
    cuerpo: 'Te escribió por el canal. Toca para leerlo.',
    url: '/jefe',
    asunto: 'canal',
    soloSi: (evento) =>
      (evento.data as { emisor?: string } | undefined)?.emisor === 'empleada',
  },
  service_cancelled: {
    titulo: 'Servicio cancelado',
    cuerpo: 'Se canceló un servicio de tu equipo.',
    url: '/jefe',
    asunto: 'cancelado',
  },
  employee_accepted_service: {
    titulo: 'Servicio aceptado',
    cuerpo: 'Una empleada acepto un servicio. Toca para continuar.',
    url: '/jefe',
    asunto: 'aceptacion',
  },
  employee_rejected_service: {
    titulo: 'Servicio rechazado',
    cuerpo: 'Una empleada rechazo un servicio. Se requiere tu atencion.',
    url: '/jefe',
    asunto: 'rechazo',
    urgente: true,
  },
  employee_acceptance_escalated: {
    titulo: 'Servicio sin respuesta',
    cuerpo: 'Se agoto el tiempo de respuesta. Se requiere tu atencion.',
    url: '/jefe',
    asunto: 'sin-respuesta',
    urgente: true,
  },
  trip_accepted: {
    titulo: 'Viaje aceptado',
    cuerpo: 'Un chofer acepto el viaje. Toca para revisar el traslado.',
    url: '/jefe',
    asunto: 'viaje-aceptado',
  },
  external_transport_assigned: {
    titulo: 'Transporte externo asignado',
    cuerpo: 'El traslado externo quedo listo.',
    url: '/jefe',
    asunto: 'transporte-externo',
  },
  service_started: {
    titulo: 'Servicio iniciado',
    cuerpo: 'Un servicio de tu equipo acaba de iniciar.',
    url: '/jefe',
    asunto: 'inicio',
  },
  service_extended: {
    titulo: 'Extension registrada',
    cuerpo: 'Se registro una extension de tiempo en un servicio.',
    url: '/jefe',
    asunto: 'extension',
  },
  service_extra_added: {
    titulo: 'Extra registrado',
    cuerpo: 'Se registro un extra en un servicio.',
    url: '/jefe',
    asunto: 'extra',
  },
  SERVICE_PANIC_ACTIVATED: {
    titulo: 'Alerta de seguridad',
    cuerpo: 'Se requiere tu atencion inmediata dentro de la aplicacion.',
    url: '/jefe',
    asunto: 'panico',
    urgente: true,
  },
  SERVICE_ENDING_SOON: {
    titulo: 'Servicio por terminar',
    cuerpo: 'Faltan aproximadamente 15 minutos. Toca para revisar.',
    url: '/jefe',
    asunto: 'fin-proximo',
  },
  service_fully_completed: {
    titulo: 'Servicio finalizado',
    cuerpo: 'Un servicio completo llego a su cierre operativo.',
    url: '/jefe',
    asunto: 'finalizado',
  },
  return_transport_selected: {
    titulo: 'Transporte de regreso asignado',
    cuerpo: 'El regreso quedo asignado. Toca para revisar.',
    url: '/jefe',
    asunto: 'regreso',
  },
  return_transport_escalated: {
    titulo: 'Regreso requiere atencion',
    cuerpo: 'Hay un regreso sin resolver. Se requiere tu atencion.',
    url: '/jefe',
    asunto: 'regreso-escalado',
    urgente: true,
  },
  no_drivers_available: {
    titulo: 'No hay chofer disponible',
    cuerpo: 'Se requiere una alternativa de transporte.',
    url: '/jefe',
    asunto: 'sin-chofer',
    urgente: true,
  },
  /*
   * Los dos avisos del traslado que la modelo marca ella misma.
   *
   * El evento ya se emitia y el panel se refrescaba con el, pero en silencio:
   * el jefe tenia que estar mirando la pantalla y darse cuenta de que una fila
   * habia cambiado. Fuera del panel no le llegaba nada, y son los dos momentos
   * en los que necesita saber si el traslado va bien.
   *
   * Solo lo que marca ella: las otras dos acciones del mismo evento --el Uber
   * en camino y el Uber ya llegó-- las hace el propio jefe, y avisarle de lo
   * que acaba de pulsar seria ruido.
   */
  trip_status_updated: {
    titulo: (evento) =>
      accionDelViaje(evento) === 'employee_arrived'
        ? 'Llegada confirmada'
        : 'Traslado en marcha',
    cuerpo: (evento) => {
      const vuelta = datosDelEvento(evento).tripType === 'regreso';
      return accionDelViaje(evento) === 'employee_arrived'
        ? vuelta
          ? 'Una empleada llegó a su casa. Toca para verlo.'
          : 'Una empleada llegó al punto. Toca para verlo.'
        : vuelta
          ? 'Una empleada ya va de regreso. Toca para verlo.'
          : 'Una empleada ya va en camino. Toca para verlo.';
    },
    url: '/jefe',
    asunto: 'traslado',
    soloSi: (evento) =>
      accionDelViaje(evento) === 'employee_en_route' ||
      accionDelViaje(evento) === 'employee_arrived',
  },
};

const AVISOS_DE_LA_EMPLEADA: Record<string, AvisoDeEvento> = {
  service_waiting_employee_acceptance: {
    titulo: 'Tienes un servicio por aceptar',
    cuerpo: 'Revisa los datos y responde desde tu portal.',
    url: '/empleada/servicio',
    asunto: 'aceptacion',
    urgente: true,
  },
  new_service: {
    titulo: 'Tienes un nuevo servicio',
    cuerpo: 'Entra a tu portal para revisarlo y responder.',
    url: '/empleada/portal',
    asunto: 'nuevo-servicio',
    urgente: true,
  },
  employee_acceptance_reminder: {
    titulo: 'Respuesta pendiente',
    cuerpo: 'Tienes un servicio esperando tu respuesta.',
    url: '/empleada/portal',
    asunto: 'recordatorio-aceptacion',
    urgente: true,
  },
  employee_acceptance_escalated: {
    titulo: 'Ultimo aviso de aceptacion',
    cuerpo: 'La coordinacion fue avisada. Revisa tu portal ahora.',
    url: '/empleada/servicio',
    asunto: 'aceptacion-final',
    urgente: true,
  },
  service_cancelled: {
    titulo: 'Servicio cancelado',
    cuerpo: 'Un servicio asignado fue cancelado.',
    url: '/empleada/portal',
    asunto: 'cancelado',
    urgente: true,
  },
  internal_transport_selected: {
    titulo: 'Transporte interno seleccionado',
    cuerpo: 'Se esta buscando un chofer para tu traslado.',
    url: '/empleada/portal',
    asunto: 'transporte-interno',
  },
  trip_accepted: {
    titulo: 'Tu chofer va en camino',
    cuerpo: 'Toca para ver los datos del coche.',
    url: '/empleada/portal',
    asunto: 'chofer-asignado',
    urgente: true,
  },
  trip_status_updated: {
    titulo: 'Tu chofer ya llego',
    cuerpo: 'Esta en el punto de recogida. Revisa tu portal.',
    url: '/empleada/portal',
    asunto: 'avance-viaje',
    urgente: true,
    soloSi: (evento) => accionDelViaje(evento) === 'driver_arrived',
  },
  external_transport_assigned: {
    titulo: 'Tu transporte esta listo',
    cuerpo: 'Entra a tu portal para revisar el traslado.',
    url: '/empleada/portal',
    asunto: 'transporte-externo',
    urgente: true,
  },
  SERVICE_ENDING_SOON: {
    titulo: 'Servicio por terminar',
    cuerpo: 'Faltan aproximadamente 15 minutos. Revisa tu portal.',
    url: '/empleada/servicio',
    asunto: 'fin-proximo',
  },
  service_started: {
    titulo: 'Servicio iniciado',
    cuerpo: 'El servicio quedo activo. Continua desde tu portal.',
    url: '/empleada/servicio',
    asunto: 'servicio-iniciado',
    urgente: true,
  },
  return_transport_selected: {
    titulo: 'Regreso asignado',
    cuerpo: 'Tu transporte de regreso esta listo.',
    url: '/empleada/portal',
    asunto: 'regreso',
    urgente: true,
  },
  SERVICE_PANIC_ACTIVATED: {
    titulo: 'Alerta de seguridad activa',
    cuerpo: 'La coordinacion fue notificada. Mantente en tu portal.',
    url: '/empleada/servicio',
    asunto: 'panico',
    urgente: true,
  },
};

const AVISOS_DEL_CHOFER: Record<string, AvisoDeEvento> = {
  trip_offered: {
    titulo: 'Tienes un viaje disponible',
    cuerpo: 'Entra a tu portal para revisarlo antes de que expire.',
    url: '/chofer/portal',
    asunto: 'oferta-viaje',
    urgente: true,
  },
  trip_accepted: {
    titulo: 'Viaje asignado',
    cuerpo: 'El viaje quedo a tu cargo. Revisa tu portal.',
    url: '/chofer/servicio',
    asunto: 'viaje-ganado',
    urgente: true,
  },
  trip_offer_released: {
    titulo: 'Viaje no disponible',
    cuerpo: 'La oferta ya no esta disponible.',
    url: '/chofer/portal',
    asunto: 'oferta-cerrada',
  },
  trip_cancelled: {
    titulo: 'Viaje cancelado',
    cuerpo: 'Un viaje asignado fue cancelado.',
    url: '/chofer/portal',
    asunto: 'viaje-cancelado',
    urgente: true,
  },
  SERVICE_PANIC_ACTIVATED: {
    titulo: 'Alerta de seguridad',
    cuerpo: 'Se requiere tu atencion dentro de la aplicacion.',
    url: '/chofer/servicio',
    asunto: 'panico',
    urgente: true,
  },
};

const AVISOS_DEL_ADMIN: Record<string, AvisoDeEvento> = {
  SERVICE_PANIC_ACTIVATED: {
    titulo: 'Alerta de seguridad',
    cuerpo: 'Hay una alerta que requiere revision administrativa.',
    url: '/admin/alerts',
    asunto: 'panico-admin',
  },
  no_drivers_available: {
    titulo: 'Fallo critico de transporte',
    cuerpo: 'Un servicio no encontro chofer disponible.',
    url: '/admin/services',
    asunto: 'sin-chofer-admin',
  },
  return_transport_escalated: {
    titulo: 'Servicio requiere intervencion',
    cuerpo: 'Un regreso sigue sin resolverse.',
    url: '/admin/services',
    asunto: 'atorado-admin',
  },
};

function datosDelEvento(evento: Record<string, unknown>): {
  action?: string;
  tripType?: string;
} {
  return (
    (evento.data as { action?: string; tripType?: string } | undefined) ?? {}
  );
}

function accionDelViaje(evento: Record<string, unknown>): string | undefined {
  return datosDelEvento(evento).action;
}

/**
 * Convierte eventos del sistema en avisos push.
 *
 * Existe porque enganchar cada aviso a mano ya salio mal varias veces: uno
 * quedo en un metodo por el que el camino real no pasaba, otro dentro de una
 * rama que solo cubria las citas programadas, y ninguno de los dos fallo de
 * forma visible. Un evento, en cambio, se emite en el punto donde el estado
 * cambia de verdad.
 *
 * El catalogo incluye avisos opcionales y operativos. Los operativos se marcan
 * como urgentes y no viajan con `tipo`, por lo que no pueden apagarse desde
 * preferencias. La deduplicacion durable absorbe el caso en que un punto
 * critico tambien tenga un envio directo de respaldo.
 */
@Injectable()
export class NotificationsBridge implements OnModuleInit {
  private readonly logger = new Logger(NotificationsBridge.name);

  constructor(
    private readonly realtime: RealtimeEventsService,
    private readonly notifications: NotificationsService,
    @InjectRepository(Empleadas)
    private readonly empleadas: Repository<Empleadas>,
    @InjectRepository(Choferes)
    private readonly choferes: Repository<Choferes>,
    @InjectRepository(Usuarios)
    private readonly usuarios: Repository<Usuarios>,
  ) {}

  onModuleInit(): void {
    this.realtime.onLocalDispatch((message) => {
      void this.alEvento(message);
    });
  }

  private async alEvento(message: RealtimeMessage): Promise<void> {
    const tipo = (message.event as { type?: string } | undefined)?.type;
    if (!tipo) return;

    try {
      await this.avisarDestinatario(message, tipo);
      await this.avisarAdmins(message.event, tipo);
    } catch (err) {
      this.logger.error(`Error avisando del evento ${tipo}:`, err);
    }
  }

  private async avisarDestinatario(
    message: RealtimeMessage,
    tipo: string,
  ): Promise<void> {
    if (!message.key) return;

    const catalogo = this.catalogoPara(message.target);
    const aviso = catalogo?.[tipo];
    if (!aviso) return;
    const evento = message.event as Record<string, unknown>;
    if (aviso.soloSi && !aviso.soloSi(evento)) return;

    const usuarioId = await this.usuarioDe(message.target, message.key);
    if (!usuarioId) return;
    await this.enviar(usuarioId, tipo, aviso, evento, message.target);
  }

  /** Solo los eventos criticos del catalogo admin llegan a administradores. */
  private async avisarAdmins(event: unknown, tipo: string): Promise<void> {
    const aviso = AVISOS_DEL_ADMIN[tipo];
    if (!aviso) return;
    const evento = event as Record<string, unknown>;
    if (aviso.soloSi && !aviso.soloSi(evento)) return;

    const admins = await this.usuarios.find({
      where: { rol: 'admin', activo: true },
      select: { id: true },
    });
    await Promise.allSettled(
      admins.map((admin) =>
        this.enviar(admin.id, tipo, aviso, evento, 'admin'),
      ),
    );
  }

  private catalogoPara(
    target: RealtimeMessage['target'],
  ): Record<string, AvisoDeEvento> | null {
    if (target === 'boss') return AVISOS_DEL_JEFE;
    if (target === 'employee') return AVISOS_DE_LA_EMPLEADA;
    if (target === 'driver') return AVISOS_DEL_CHOFER;
    return null;
  }

  private async usuarioDe(
    target: RealtimeMessage['target'],
    key: string,
  ): Promise<string | null> {
    if (target === 'boss') return key;
    if (target === 'employee') {
      const empleada = await this.empleadas.findOne({
        where: { id: key },
        select: { usuarioId: true },
      });
      return empleada?.usuarioId ?? null;
    }
    if (target === 'driver') {
      const chofer = await this.choferes.findOne({
        where: { id: key },
        select: { usuarioId: true },
      });
      return chofer?.usuarioId ?? null;
    }
    return null;
  }

  private async enviar(
    usuarioId: string,
    tipo: string,
    aviso: AvisoDeEvento,
    evento: Record<string, unknown>,
    target: string,
  ): Promise<void> {
    const referencia = this.referencia(evento);
    await this.notifications.notificar(usuarioId, {
      titulo: this.resolver(aviso.titulo, evento),
      cuerpo: this.resolver(aviso.cuerpo, evento),
      url: aviso.url,
      tag: `${aviso.asunto}-${referencia}`,
      ...(aviso.urgente ? {} : { tipo }),
      relatedEntityId: this.entidadRelacionada(evento),
      dedupeKey: `${target}:${tipo}:${this.identidad(evento, referencia)}`,
    });
  }

  /** El texto del aviso, ya sea fijo o derivado del evento. */
  private resolver(texto: Texto, evento: Record<string, unknown>): string {
    return typeof texto === 'function' ? texto(evento) : texto;
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
      // El canal de dudas no cuelga de ningun servicio: sus avisos se agrupan
      // por modelo, que es lo que los hace ser "la misma conversacion".
      'empleadaId',
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

  /** Identifica el suceso concreto; el `tag` puede agrupar varios sucesos. */
  private identidad(event: unknown, referencia: string): string {
    const data = (event as { data?: Record<string, unknown> } | undefined)
      ?.data;
    for (const clave of [
      'eventId',
      'messageId',
      'extraId',
      'extensionId',
      'id',
    ]) {
      const valor = data?.[clave];
      if (typeof valor === 'string' || typeof valor === 'number') {
        return String(valor);
      }
    }
    const valorVariante =
      data?.action ?? data?.state ?? data?.status ?? data?.tripType ?? 'event';
    const variante =
      typeof valorVariante === 'string' || typeof valorVariante === 'number'
        ? String(valorVariante)
        : 'event';
    return `${referencia}:${variante}`;
  }

  private entidadRelacionada(event: unknown): string | undefined {
    const data = (event as { data?: Record<string, unknown> } | undefined)
      ?.data;
    for (const clave of ['serviceId', 'servicioId', 'tripId', 'requestId']) {
      const valor = data?.[clave];
      if (
        typeof valor === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          valor,
        )
      ) {
        return valor;
      }
    }
    return undefined;
  }
}
