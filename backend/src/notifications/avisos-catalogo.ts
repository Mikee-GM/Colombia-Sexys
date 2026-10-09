/**
 * Los avisos que cada persona puede apagar.
 *
 * Solo estan aqui los de nivel 2: los que conviene recibir, pero cuya demora no
 * rompe nada. Los de nivel 1 --un servicio esperando autorizacion, una oferta
 * de viaje que caduca, un cliente esperando en la puerta-- no aparecen a
 * proposito: si se pudieran apagar, el sistema dejaria de funcionar sin que
 * nadie supiera por que.
 *
 * Es la fuente unica: el backend decide con esto si manda, y la pantalla de
 * ajustes se dibuja con esto mismo. Un tipo que no este en la lista no se puede
 * apagar aunque el cliente lo pida.
 */
export type TipoDeAviso = {
  /** La clave que se guarda en `user_preferences`, bajo `avisos`. */
  tipo: string;
  titulo: string;
  descripcion: string;
  /** Quien lo recibe. Un rol que no esta aqui no ve el interruptor. */
  roles: string[];
};

/*
 * Las claves de los avisos del jefe son el `type` del evento en vivo que los
 * origina, porque el puente los deriva de ahi. Las de la modelo y el chofer son
 * nombres propios, porque esos se enganchan a mano donde ocurren.
 */
export const AVISO_SANCION = 'sancion';
export const AVISO_FOTOS_SEMANALES = 'fotos_semanales';
export const AVISO_REGISTRO_APROBADO = 'registro_aprobado';
export const AVISO_LIQUIDACION = 'liquidacion';

export const AVISOS_OPCIONALES: TipoDeAviso[] = [
  {
    tipo: 'service_requests_competing',
    titulo: 'Solicitudes que compiten',
    descripcion: 'Dos clientes piden a la misma modelo a la misma hora.',
    roles: ['jefe', 'admin'],
  },
  {
    tipo: 'group_service_request_created',
    titulo: 'Servicios grupales',
    descripcion: 'Un cliente pide varias modelos a la vez.',
    roles: ['jefe', 'admin'],
  },
  {
    tipo: 'manual_service_requested',
    titulo: 'Registros a mano',
    descripcion:
      'Una modelo pide registrar un servicio que hizo por su cuenta.',
    roles: ['jefe', 'admin'],
  },
  {
    tipo: 'chat_message',
    titulo: 'Mensajes del cliente',
    descripcion: 'Un cliente escribe en una conversación tuya.',
    roles: ['jefe', 'admin'],
  },
  {
    tipo: 'group_chat_message',
    titulo: 'Mensajes en grupales',
    descripcion: 'Un cliente escribe en un servicio grupal tuyo.',
    roles: ['jefe', 'admin'],
  },
  {
    tipo: 'service_cancelled',
    titulo: 'Cancelaciones',
    descripcion: 'Se cancela un servicio de tu equipo.',
    roles: ['jefe', 'admin'],
  },
  {
    tipo: 'trip_status_updated',
    titulo: 'Avance del traslado',
    descripcion: 'Una modelo marca que ya va en el coche o que ya llego.',
    roles: ['jefe', 'admin'],
  },
  {
    tipo: 'employee_accepted_service',
    titulo: 'Aceptacion de servicios',
    descripcion: 'Una modelo acepta el servicio que le fue asignado.',
    roles: ['jefe', 'admin'],
  },
  {
    tipo: 'trip_accepted',
    titulo: 'Viajes aceptados',
    descripcion: 'Un chofer acepta un traslado interno.',
    roles: ['jefe', 'admin'],
  },
  {
    tipo: 'external_transport_assigned',
    titulo: 'Transporte externo',
    descripcion: 'Queda asignado un traslado externo.',
    roles: ['jefe', 'admin'],
  },
  {
    tipo: 'service_started',
    titulo: 'Inicio de servicios',
    descripcion: 'Un servicio del equipo comienza.',
    roles: ['jefe', 'admin'],
  },
  {
    tipo: 'service_extended',
    titulo: 'Extensiones',
    descripcion: 'Se registra una extension de tiempo.',
    roles: ['jefe', 'admin'],
  },
  {
    tipo: 'service_extra_added',
    titulo: 'Extras',
    descripcion: 'Se registra un extra durante un servicio.',
    roles: ['jefe', 'admin'],
  },
  {
    tipo: 'SERVICE_ENDING_SOON',
    titulo: 'Servicio por terminar',
    descripcion: 'Faltan aproximadamente 15 minutos para terminar.',
    roles: ['jefe', 'empleada', 'admin'],
  },
  {
    tipo: 'service_fully_completed',
    titulo: 'Cierre operativo',
    descripcion: 'Un servicio completa tambien su regreso.',
    roles: ['jefe', 'admin'],
  },
  {
    tipo: 'internal_transport_selected',
    titulo: 'Transporte interno',
    descripcion: 'Coordinacion selecciona un traslado interno.',
    roles: ['empleada'],
  },
  {
    tipo: 'trip_offer_released',
    titulo: 'Cambios en ofertas de viaje',
    descripcion: 'Una oferta deja de estar disponible.',
    roles: ['chofer'],
  },
  {
    tipo: 'SERVICE_PANIC_ACTIVATED',
    titulo: 'Alertas de seguridad',
    descripcion: 'Una alerta requiere revision administrativa.',
    roles: ['admin'],
  },
  {
    tipo: 'no_drivers_available',
    titulo: 'Fallos criticos de transporte',
    descripcion: 'Un servicio no encuentra chofer disponible.',
    roles: ['admin'],
  },
  {
    tipo: 'return_transport_escalated',
    titulo: 'Servicios atorados',
    descripcion: 'Un regreso sigue sin resolverse.',
    roles: ['admin'],
  },
  {
    tipo: 'push_delivery_repeated_failure',
    titulo: 'Errores repetidos de notificaciones',
    descripcion:
      'Un dispositivo acumula fallos de entrega y requiere revision.',
    roles: ['admin'],
  },
  {
    tipo: AVISO_SANCION,
    titulo: 'Sanciones y multas',
    descripcion: 'Se te aplica una multa o una sancion.',
    roles: ['empleada', 'chofer'],
  },
  {
    tipo: AVISO_FOTOS_SEMANALES,
    titulo: 'Fotos de la semana',
    descripcion: 'Recordatorio de que te faltan fotos antes de la multa.',
    roles: ['empleada'],
  },
  {
    tipo: AVISO_REGISTRO_APROBADO,
    titulo: 'Registros aprobados',
    descripcion: 'Aprueban un servicio que registraste a mano.',
    roles: ['empleada'],
  },
  {
    tipo: AVISO_LIQUIDACION,
    titulo: 'Liquidacion semanal',
    descripcion: 'Se cierra tu semana y queda listo tu pago.',
    roles: ['chofer'],
  },
];

/** Los interruptores que le tocan a un rol. */
export function avisosDeRol(rol: string): TipoDeAviso[] {
  return AVISOS_OPCIONALES.filter((aviso) => aviso.roles.includes(rol));
}
