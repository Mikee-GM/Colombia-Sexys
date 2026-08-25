/**
 * Motivos de cancelacion de un servicio, con la etiqueta que ve la oficina.
 *
 * Los identificadores deben coincidir con `backend/src/services/cancellation-reasons.ts`:
 * el backend valida contra esa lista y la base tiene un CHECK con los mismos valores.
 */
export const CANCELLATION_REASONS = [
  "cliente_desistio",
  "cliente_no_responde",
  "modelo_no_disponible",
  "modelo_tardanza",
  "sin_transporte",
  "problema_pago",
  "seguridad",
  "error_operativo",
  "rechazado_por_jefe",
  "otro",
] as const;

export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export const CANCELLATION_REASON_LABEL: Record<CancellationReason, string> = {
  cliente_desistio: "El cliente desistio",
  cliente_no_responde: "El cliente no responde",
  modelo_no_disponible: "La modelo no pudo asistir",
  modelo_tardanza: "La modelo se retraso",
  sin_transporte: "No hubo transporte disponible",
  problema_pago: "Problema con el pago",
  seguridad: "Riesgo de seguridad",
  error_operativo: "Error operativo de la oficina",
  rechazado_por_jefe: "Rechazado por el jefe",
  otro: "Otro motivo",
};

/**
 * Los motivos que se ofrecen al cancelar a mano. `rechazado_por_jefe` y
 * `modelo_tardanza` los escribe el sistema en sus propios flujos, asi que no
 * tiene sentido elegirlos desde el dialogo.
 */
export const SELECTABLE_CANCELLATION_REASONS = CANCELLATION_REASONS.filter(
  (reason) => reason !== "rechazado_por_jefe",
);

export function cancellationReasonLabel(
  reason: string | null | undefined,
): string {
  if (!reason) return "Sin registrar";
  return (
    CANCELLATION_REASON_LABEL[reason as CancellationReason] ?? "Sin registrar"
  );
}
