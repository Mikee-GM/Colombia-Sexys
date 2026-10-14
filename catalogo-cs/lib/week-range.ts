import {
  APP_TIME_ZONE,
  desdeHoraDelNegocio,
  paraInputDeFechaHora,
} from "@/lib/locale";

/**
 * Semana operativa de lunes a domingo, en la hora del negocio.
 *
 * El corte semanal, los cortes de choferes, el transporte y el panel de dinero
 * comparten este rango; antes se recalculaba en cada pagina y cualquier
 * variacion habria producido totales distintos para el mismo periodo.
 *
 * Se calcula en `America/Mexico_City` y no en UTC. Con UTC, el lunes empezaba a
 * las seis de la tarde del domingo hora de aqui: los servicios de esa noche
 * --que no son pocos-- caian en la semana siguiente y el corte no cuadraba con
 * lo que se habia trabajado. Es la misma regla que sigue el resto de la casa:
 * ninguna vista fija su propia zona.
 */
export function getOperationalWeek(reference: Date = new Date()) {
  const hoy = enZonaDelNegocio(reference);

  const lunes = new Date(hoy);
  const diaDeLaSemana = lunes.getUTCDay() || 7; // domingo cuenta como 7
  lunes.setUTCDate(lunes.getUTCDate() - diaDeLaSemana + 1);

  const domingo = new Date(lunes);
  domingo.setUTCDate(lunes.getUTCDate() + 6);

  return {
    startDate: lunes.toISOString().slice(0, 10),
    endDate: domingo.toISOString().slice(0, 10),
  };
}

/** Limites inclusivos de dias de calendario, siempre en la zona del negocio. */
export function getOperationalDateRange(startDate: string, endDate: string) {
  const boundary = (date: string, time: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new RangeError("El periodo debe usar fechas de calendario validas");
    }
    const instant = desdeHoraDelNegocio(`${date}T${time}`);
    if (!instant || paraInputDeFechaHora(instant).slice(0, 10) !== date) {
      throw new RangeError("El periodo debe usar fechas de calendario validas");
    }
    return instant;
  };
  const start = boundary(startDate, "00:00:00");
  const end = new Date(boundary(endDate, "23:59:59").getTime() + 999);
  if (start > end) throw new RangeError("El inicio debe ser anterior al final");
  return { start, end };
}

/** Fechas para APIs de calendario e instantes para APIs de fecha-hora. */
export function getOperationalWeekPeriod(reference: Date) {
  const dates = getOperationalWeek(reference);
  const period = getOperationalDateRange(dates.startDate, dates.endDate);
  const thursday = new Date(`${dates.startDate}T00:00:00Z`);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const week = Math.ceil(
    ((thursday.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7,
  );
  return { ...dates, ...period, weekLabel: `${year}-W${week}` };
}

/** Navega semanas de calendario sin heredar la zona ni el DST del dispositivo. */
export function shiftOperationalWeek(reference: Date, weeks: number) {
  const { startDate } = getOperationalWeek(reference);
  const next = new Date(`${startDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + weeks * 7);
  const date = next.toISOString().slice(0, 10);
  return getOperationalDateRange(date, date).start;
}

/**
 * El mismo instante, leido como fecha del calendario del negocio.
 *
 * Devuelve un `Date` cuya parte UTC es el dia y la hora de Mexico, que es lo
 * que permite hacer la aritmetica de dias con `getUTCDate` sin que la zona del
 * servidor --que en produccion es UTC y en un portatil cualquiera-- cambie el
 * resultado.
 */
function enZonaDelNegocio(reference: Date): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(reference);

  const valor = (tipo: string) =>
    Number(partes.find((parte) => parte.type === tipo)?.value ?? "0");

  return new Date(
    Date.UTC(
      valor("year"),
      valor("month") - 1,
      valor("day"),
      // `hour12: false` da 24 para la medianoche en algunos entornos.
      valor("hour") % 24,
      valor("minute"),
      valor("second"),
    ),
  );
}
