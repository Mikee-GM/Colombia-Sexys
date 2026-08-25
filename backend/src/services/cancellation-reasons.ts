/**
 * Motivos de cancelacion de un servicio.
 *
 * Antes una cancelacion solo dejaba `estado = 'cancelado'`, asi que "el cliente
 * se arrepintio" y "la modelo no llego" quedaban indistinguibles. Sin esa
 * diferencia no se puede cobrar una penalizacion, ajustar la confiabilidad de
 * la modelo ni marcar a un cliente que cancela siempre.
 *
 * La lista es corta a proposito: cada motivo tiene que implicar una consecuencia
 * operativa distinta, si no, se convierte en un campo que nadie llena bien.
 */
export const CANCELLATION_REASONS = [
  'cliente_desistio',
  'cliente_no_responde',
  'modelo_no_disponible',
  'modelo_tardanza',
  'sin_transporte',
  'problema_pago',
  'seguridad',
  'error_operativo',
  'rechazado_por_jefe',
  'otro',
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

/**
 * A quien se le atribuye la cancelacion. Es una funcion y no una columna para
 * que la atribucion se pueda reajustar sin migrar los servicios ya cancelados.
 */
export type CancellationParty = 'cliente' | 'empleada' | 'operacion' | 'ninguno';

const PARTY_BY_REASON: Record<CancellationReason, CancellationParty> = {
  cliente_desistio: 'cliente',
  cliente_no_responde: 'cliente',
  modelo_no_disponible: 'empleada',
  modelo_tardanza: 'empleada',
  sin_transporte: 'operacion',
  problema_pago: 'cliente',
  seguridad: 'ninguno',
  error_operativo: 'operacion',
  rechazado_por_jefe: 'operacion',
  otro: 'ninguno',
};

export function cancellationParty(
  reason: CancellationReason | null | undefined,
): CancellationParty {
  return reason ? PARTY_BY_REASON[reason] : 'ninguno';
}
