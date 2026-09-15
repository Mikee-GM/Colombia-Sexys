import { APP_TIME_ZONE } from "@/lib/locale";

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
