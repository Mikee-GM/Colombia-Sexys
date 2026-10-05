export const SERVICE_OPERATION_STATES = [
  'preparacion',
  'preparado',
  'asignado',
  'esperando_aceptacion_empleada',
  'aceptado',
  'esperando_transporte_ida',
  'transporte_ida_asignado',
  'empleada_en_camino',
  'empleada_llego',
  'en_curso',
  'preparando_regreso',
  'transporte_regreso_asignado',
  'empleada_de_regreso',
  'finalizado',
  'rechazado',
  'cancelado',
  'expirado',
] as const;

export type ServiceOperationState = (typeof SERVICE_OPERATION_STATES)[number];

export const SERVICE_OPERATION_ACTIONS = [
  'preparar',
  'asignar',
  'solicitar_aceptacion_empleada',
  'aceptar_empleada',
  'rechazar_empleada',
  'esperar_transporte_ida',
  'asignar_transporte_ida',
  'empleada_sale',
  'empleada_llega',
  'iniciar_servicio',
  'preparar_regreso',
  'asignar_transporte_regreso',
  'empleada_regresa',
  'finalizar',
  'cancelar',
  'expirar',
] as const;

export type ServiceOperationAction = (typeof SERVICE_OPERATION_ACTIONS)[number];

export const TERMINAL_SERVICE_OPERATION_STATES = new Set<ServiceOperationState>(
  ['finalizado', 'rechazado', 'cancelado', 'expirado'],
);

const TRANSITIONS: Record<
  ServiceOperationState,
  Partial<Record<ServiceOperationAction, ServiceOperationState>>
> = {
  preparacion: { preparar: 'preparado', cancelar: 'cancelado' },
  preparado: { asignar: 'asignado', cancelar: 'cancelado' },
  asignado: {
    solicitar_aceptacion_empleada: 'esperando_aceptacion_empleada',
    cancelar: 'cancelado',
  },
  esperando_aceptacion_empleada: {
    aceptar_empleada: 'aceptado',
    rechazar_empleada: 'rechazado',
    expirar: 'expirado',
    cancelar: 'cancelado',
  },
  aceptado: {
    esperar_transporte_ida: 'esperando_transporte_ida',
    asignar_transporte_ida: 'transporte_ida_asignado',
    cancelar: 'cancelado',
  },
  esperando_transporte_ida: {
    asignar_transporte_ida: 'transporte_ida_asignado',
    cancelar: 'cancelado',
  },
  transporte_ida_asignado: {
    empleada_sale: 'empleada_en_camino',
    cancelar: 'cancelado',
  },
  empleada_en_camino: {
    empleada_llega: 'empleada_llego',
    cancelar: 'cancelado',
  },
  empleada_llego: {
    iniciar_servicio: 'en_curso',
    cancelar: 'cancelado',
  },
  en_curso: { preparar_regreso: 'preparando_regreso', cancelar: 'cancelado' },
  preparando_regreso: {
    asignar_transporte_regreso: 'transporte_regreso_asignado',
    finalizar: 'finalizado',
    cancelar: 'cancelado',
  },
  transporte_regreso_asignado: {
    empleada_regresa: 'empleada_de_regreso',
    cancelar: 'cancelado',
  },
  empleada_de_regreso: { finalizar: 'finalizado', cancelar: 'cancelado' },
  finalizado: {},
  rechazado: {},
  cancelado: {},
  expirado: {},
};

/**
 * Política única de avance del servicio. Los controladores y canales no
 * interpretan estados: piden una acción y este núcleo decide si corresponde.
 */
export function nextServiceOperationState(
  current: ServiceOperationState,
  action: ServiceOperationAction,
): ServiceOperationState | null {
  return TRANSITIONS[current]?.[action] ?? null;
}

export function availableServiceOperationActions(
  current: ServiceOperationState,
): ServiceOperationAction[] {
  return Object.keys(TRANSITIONS[current]) as ServiceOperationAction[];
}

export function isServiceOperationState(
  value: unknown,
): value is ServiceOperationState {
  return (
    typeof value === 'string' &&
    (SERVICE_OPERATION_STATES as readonly string[]).includes(value)
  );
}

/** Compatibilidad para filas anteriores a la máquina de estados operativa. */
export function operationStateFromLegacy(service: {
  estado?: string | null;
  horaLlegadaCasa?: Date | string | null;
}): ServiceOperationState {
  switch (service.estado) {
    case 'agendado':
      return 'asignado';
    case 'en_curso':
      return 'en_curso';
    case 'finalizado':
      return service.horaLlegadaCasa ? 'finalizado' : 'preparando_regreso';
    case 'cancelado':
      return 'cancelado';
    default:
      return 'preparacion';
  }
}
