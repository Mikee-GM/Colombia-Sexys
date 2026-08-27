/**
 * Cuentas de duracion de un servicio.
 *
 * Viven aparte del handler de Telegram porque el cierre de un servicio ya no
 * ocurre solo desde el chat: el portal de la modelo lo hace tambien, y las dos
 * vias tienen que redondear y describir el tiempo exactamente igual.
 */

/**
 * Convierte la duracion real de un servicio abierto en horas facturables.
 *
 * Se redondea hacia arriba a partir de los 15 minutos de la hora en curso
 * (2h 15m son 3 horas; 2h 14m son 2). Minimo una hora.
 */
export function roundOpenEndedHours(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 1;
  const totalMinutes = Math.floor(durationMs / 60_000);
  const fullHours = Math.floor(totalMinutes / 60);
  const remainderMinutes = totalMinutes % 60;
  const billable = fullHours + (remainderMinutes >= 15 ? 1 : 0);
  return Math.max(1, billable);
}

/**
 * Duracion en texto para la modelo y el cliente: "2 horas, 35 minutos".
 *
 * Se omiten las unidades en cero para que no salga "0 horas, 3 minutos", pero
 * los segundos se conservan cuando son lo unico que hay: un servicio cerrado
 * por error tiene que poder verse como lo que fue.
 */
export function formatServiceDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hora' : 'horas'}`);
  if (minutes > 0)
    parts.push(`${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`);
  if (seconds > 0 || parts.length === 0)
    parts.push(`${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`);

  return parts.join(', ');
}
