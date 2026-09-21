/**
 * Configuracion regional unica de la aplicacion.
 *
 * El negocio se opera desde Mexico, aunque las modelos del catalogo sean
 * colombianas: el dinero se cobra y se liquida en pesos mexicanos y la agenda
 * corre en hora de Ciudad de Mexico. Existe este modulo unico porque varias
 * vistas fijaban su propia zona horaria por su cuenta, y basta una diferencia
 * de una hora para que la disponibilidad de una modelo se muestre corrida.
 */
export const APP_TIME_ZONE = "America/Mexico_City";

export const APP_LOCALE = "es-MX";

/**
 * Las partes de un instante leidas en la zona del negocio.
 *
 * Es la pieza comun de los dos helpers de abajo: `Intl` es lo unico que sabe
 * que hora era en Mexico en un momento dado sin depender de la zona del
 * telefono, que en un panel instalado puede ser cualquiera.
 */
function partesEnHoraDelNegocio(fecha: Date): {
  anio: number;
  mes: number;
  dia: number;
  hora: number;
  minuto: number;
  segundo: number;
} {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(fecha);

  const valor = (tipo: string) =>
    Number(partes.find((parte) => parte.type === tipo)?.value ?? "0");

  return {
    anio: valor("year"),
    mes: valor("month"),
    dia: valor("day"),
    // `hour12: false` devuelve 24 para la medianoche en algunos entornos.
    hora: valor("hour") % 24,
    minuto: valor("minute"),
    segundo: valor("second"),
  };
}

/**
 * El valor que espera un `<input type="datetime-local">`: `YYYY-MM-DDTHH:mm`
 * en hora de Mexico.
 *
 * El input no entiende zonas y muestra el texto tal cual, asi que hay que
 * darselo ya convertido. Construirlo con `toISOString().slice(0,16)` mostraria
 * la hora UTC, seis horas adelantada.
 */
export function paraInputDeFechaHora(fecha: Date): string {
  const { anio, mes, dia, hora, minuto } = partesEnHoraDelNegocio(fecha);
  const dosDigitos = (valor: number) => String(valor).padStart(2, "0");
  return `${anio}-${dosDigitos(mes)}-${dosDigitos(dia)}T${dosDigitos(hora)}:${dosDigitos(minuto)}`;
}

/**
 * El texto de un `datetime-local` convertido al instante real que representa,
 * interpretandolo siempre como hora de Mexico.
 *
 * `new Date("2026-09-21T14:00")` usa la zona del navegador, que es la del
 * telefono de quien esta capturando. La agenda del negocio corre en hora de
 * Ciudad de Mexico y tiene que dar lo mismo desde donde se capture, asi que la
 * zona se resuelve aqui y no se deja al dispositivo.
 *
 * Devuelve `null` si el texto no es una fecha reconocible.
 */
export function desdeHoraDelNegocio(texto: string): Date | null {
  const limpio = texto.trim();

  // Con zona explicita no hay ambiguedad que resolver.
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(limpio)) {
    const conZona = new Date(limpio);
    return Number.isNaN(conZona.getTime()) ? null : conZona;
  }

  const partes =
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(
      limpio,
    );
  if (!partes) return null;

  const [, anio, mes, dia, hora, minuto, segundo] = partes;
  const horaDePared = Date.UTC(
    Number(anio),
    Number(mes) - 1,
    Number(dia),
    Number(hora ?? 0),
    Number(minuto ?? 0),
    Number(segundo ?? 0),
  );
  if (Number.isNaN(horaDePared)) return null;

  /*
   * Se busca el instante cuya lectura en Mexico da esa hora de pared. La
   * segunda pasada cubre el caso en que el propio salto de horario de verano
   * mueva el desfase entre una y otra.
   */
  let instante = horaDePared;
  for (let intento = 0; intento < 2; intento += 1) {
    const p = partesEnHoraDelNegocio(new Date(instante));
    const leido = Date.UTC(
      p.anio,
      p.mes - 1,
      p.dia,
      p.hora,
      p.minuto,
      p.segundo,
    );
    if (leido === horaDePared) break;
    instante += horaDePared - leido;
  }

  const resultado = new Date(instante);
  return Number.isNaN(resultado.getTime()) ? null : resultado;
}
