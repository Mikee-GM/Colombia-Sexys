/**
 * Semana operativa de lunes a domingo en UTC.
 *
 * El corte semanal, los cortes de choferes y el transporte comparten este
 * rango; antes se recalculaba en cada pagina y cualquier variacion habria
 * producido totales distintos para el mismo periodo.
 */
export function getOperationalWeek(reference: Date = new Date()) {
  const day = reference.getUTCDay() || 7; // domingo cuenta como 7
  const monday = new Date(reference);
  monday.setUTCDate(reference.getUTCDate() - day + 1);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    startDate: monday.toISOString().slice(0, 10),
    endDate: sunday.toISOString().slice(0, 10),
  };
}
