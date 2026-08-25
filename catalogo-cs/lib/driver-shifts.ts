/**
 * Ayudantes de turnos compartidos entre la malla de /admin/turnos y la ficha
 * del chofer. Vivian solo en la malla y se necesitan en los dos sitios.
 */

/** Los dias llegan como en Date.getDay(): 0 es domingo. */
export const DAY_LABELS = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];

export function formatDays(daysOfWeek: number[]) {
  if (daysOfWeek.length === 7) return "Todos los dias";
  return [...daysOfWeek]
    .sort((a, b) => (a || 7) - (b || 7))
    .map((day) => DAY_LABELS[day])
    .join(", ");
}

/** Texto de ocupacion de un turno: "2 de 4" o "2 asignados" si no hay tope. */
export function formatOccupancy(assignedCount: number, capacity: number | null) {
  return capacity == null
    ? `${assignedCount} ${assignedCount === 1 ? "asignado" : "asignados"}`
    : `${assignedCount} de ${capacity}`;
}
