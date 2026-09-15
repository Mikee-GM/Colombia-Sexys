/**
 * Zona horaria y locale de la operacion.
 *
 * El negocio se opera desde Mexico, aunque las modelos sean colombianas. La
 * zona importa sobre todo donde se compara el *dia*: los cortes diarios y los
 * plazos de contenido semanal tienen que cambiar de dia a medianoche hora de
 * Ciudad de Mexico, no a otra hora.
 */
export const APP_TIME_ZONE = 'America/Mexico_City';
export const APP_LOCALE = 'es-MX';

/**
 * El mismo instante, leido como fecha del calendario del negocio.
 *
 * Devuelve un `Date` cuya parte UTC es el dia y la hora de Mexico, que es lo
 * que permite comparar dias y semanas sin que la zona del servidor --UTC en
 * produccion, cualquiera en un portatil-- cambie el resultado.
 */
export function enHoraDelNegocio(fecha: Date): Date {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(fecha);

  const valor = (tipo: string) =>
    Number(partes.find((parte) => parte.type === tipo)?.value ?? '0');

  return new Date(
    Date.UTC(
      valor('year'),
      valor('month') - 1,
      valor('day'),
      // `hour12: false` da 24 para la medianoche en algunos entornos.
      valor('hour') % 24,
      valor('minute'),
      valor('second'),
    ),
  );
}

/**
 * El lunes de la semana operativa a la que pertenece una fecha, en formato
 * `YYYY-MM-DD` y en hora del negocio.
 */
export function lunesDeLaSemana(fecha: Date): string {
  const local = enHoraDelNegocio(fecha);
  const diaDeLaSemana = local.getUTCDay() || 7; // domingo cuenta como 7
  local.setUTCDate(local.getUTCDate() - diaDeLaSemana + 1);
  return local.toISOString().slice(0, 10);
}

/**
 * Las dos fechas caen en la misma semana operativa: de lunes a domingo, en hora
 * de Mexico.
 *
 * Es la misma semana que usan el corte semanal, los cortes de choferes y el
 * panel de dinero. Antes cada portal resolvia "la semana" como "los ultimos
 * siete dias", que es otra cosa: un lunes, la ganancia "de la semana" incluia
 * la semana anterior entera --ya liquidada y cobrada-- y nunca cuadraba con lo
 * que la oficina tenia delante.
 */
export function mismaSemanaOperativa(a: Date, b: Date): boolean {
  return lunesDeLaSemana(a) === lunesDeLaSemana(b);
}
