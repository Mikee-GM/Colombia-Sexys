export type AvailabilityStatus = "disponible" | "ocupada" | "inactiva";

export function formatAvailabilityTime(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const timeZone = "America/Mexico_City";
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const targetDay = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  const time = new Intl.DateTimeFormat("es-MX", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  if (targetDay === today) return time;
  const day = new Intl.DateTimeFormat("es-MX", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(date);
  return `${day}, ${time}`;
}

export function availabilityLabel(input: {
  availabilityStatus?: AvailabilityStatus;
  disponible: boolean;
  estimatedAvailableAt?: string | null;
  canScheduleNext?: boolean;
}): string {
  const status =
    input.availabilityStatus ??
    (input.disponible ? "disponible" : "ocupada");
  if (status === "disponible") return "Disponible";
  if (status === "inactiva") return "No disponible";
  if (input.canScheduleNext === false) return "Siguiente turno reservado";
  const eta = formatAvailabilityTime(input.estimatedAvailableAt);
  return eta ? `Ocupada hasta ${eta}` : "Ocupada";
}
