import { desdeHoraDelNegocio, enHoraDelNegocio } from './locale';

/**
 * Interpreta una fecha y una hora escritas a mano, en hora de Mexico.
 *
 * Lo usa el alta rapida de una cita desde el bot del jefe, donde antes solo se
 * podia decir "programado" y el servicio nacia con una hora de marcador fija:
 * siempre una hora a partir de ese momento, daba igual para cuando fuera la
 * cita de verdad.
 *
 * Es deterministico a proposito, sin pasar por la IA. Quien esta escribiendo
 * espera una respuesta inmediata, y una hora mal entendida manda a la modelo al
 * motel el dia que no es. Si el texto no se entiende devuelve `null` y quien
 * llama vuelve a preguntar con ejemplos; nunca se adivina.
 *
 * Entiende:
 *
 *   14:30            hoy a esa hora, o manana si ya paso
 *   2:30 pm          igual, con meridiano
 *   8pm              la hora sola con meridiano
 *   manana 14:30     el dia siguiente
 *   pasado manana 9am
 *   21/09 14:30      un dia concreto de este ano (o del que viene si ya paso)
 *   21/09/2026 14:30 con ano explicito
 */
export function interpretarFechaEscrita(
  texto: string,
  ahora: Date = new Date(),
): Date | null {
  const limpio = texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  if (!limpio) return null;

  // La parte UTC de esto es el dia y la hora de Mexico, que es el calendario
  // sobre el que el jefe esta escribiendo.
  const aqui = enHoraDelNegocio(ahora);

  let anio = aqui.getUTCFullYear();
  let mes = aqui.getUTCMonth() + 1;
  let dia = aqui.getUTCDate();
  let diaExplicito = false;
  let anioExplicito = false;

  /*
   * La fecha solo se reconoce con barras. Con puntos o guiones, "14.30" y
   * "14-30" --que son horas-- se leerian como el 14 de marzo.
   */
  const fecha = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/.exec(limpio);
  let resto = limpio;
  if (fecha) {
    const diaLeido = Number(fecha[1]);
    const mesLeido = Number(fecha[2]);
    if (diaLeido < 1 || diaLeido > 31 || mesLeido < 1 || mesLeido > 12) {
      return null;
    }
    dia = diaLeido;
    mes = mesLeido;
    diaExplicito = true;
    if (fecha[3]) {
      const anioLeido = Number(fecha[3]);
      anio = anioLeido < 100 ? 2000 + anioLeido : anioLeido;
      anioExplicito = true;
    }
    resto = limpio.replace(fecha[0], ' ');
  } else if (/\bpasado\s+manana\b/.test(limpio)) {
    dia += 2;
    diaExplicito = true;
  } else if (/\bmanana\b/.test(limpio)) {
    dia += 1;
    diaExplicito = true;
  }

  const hora = extraerHora(resto);
  if (!hora) return null;

  const candidato = componer(anio, mes, dia, hora.horas, hora.minutos);
  if (!candidato) return null;

  /*
   * Sin dia explicito, "a las 9" significa la proxima vez que sean las nueve:
   * si ya pasaron, es manana. Con dia pero sin ano, un "21/09" ya pasado es el
   * del ano que viene.
   */
  if (candidato.getTime() > ahora.getTime()) return candidato;

  if (!diaExplicito) {
    return componer(anio, mes, dia + 1, hora.horas, hora.minutos);
  }
  if (!anioExplicito) {
    return componer(anio + 1, mes, dia, hora.horas, hora.minutos);
  }
  return candidato;
}

/**
 * Compone una fecha de Mexico a partir de sus partes, dejando que el desborde
 * --el dia 32, el mes 13-- ruede solo al mes o al ano siguiente.
 */
function componer(
  anio: number,
  mes: number,
  dia: number,
  horas: number,
  minutos: number,
): Date | null {
  const rodado = new Date(Date.UTC(anio, mes - 1, dia, horas, minutos, 0));
  if (isNaN(rodado.getTime())) return null;

  const dosDigitos = (valor: number) => String(valor).padStart(2, '0');
  return desdeHoraDelNegocio(
    `${rodado.getUTCFullYear()}-${dosDigitos(rodado.getUTCMonth() + 1)}-` +
      `${dosDigitos(rodado.getUTCDate())}T${dosDigitos(rodado.getUTCHours())}:` +
      `${dosDigitos(rodado.getUTCMinutes())}:00`,
  );
}

/** La hora del texto, ya pasada a 24 h. `null` si no hay ninguna reconocible. */
function extraerHora(texto: string): { horas: number; minutos: number } | null {
  const conMinutos = /(\d{1,2})[:.](\d{2})\s*(a\.?\s?m\.?|p\.?\s?m\.?)?/.exec(
    texto,
  );
  if (conMinutos) {
    const minutos = Number(conMinutos[2]);
    if (minutos > 59) return null;
    const horas = aplicarMeridiano(Number(conMinutos[1]), conMinutos[3]);
    return horas === null ? null : { horas, minutos };
  }

  // La hora sola solo se acepta con meridiano ("8pm"): un numero suelto en una
  // frase es cualquier cosa menos una hora.
  const soloHora = /(\d{1,2})\s*(a\.?\s?m\.?|p\.?\s?m\.?)/.exec(texto);
  if (soloHora) {
    const horas = aplicarMeridiano(Number(soloHora[1]), soloHora[2]);
    return horas === null ? null : { horas, minutos: 0 };
  }

  // Y la forma "a las 20 h" o "20h", que tampoco es ambigua.
  const conH = /(\d{1,2})\s*h\b/.exec(texto);
  if (conH) {
    const horas = Number(conH[1]);
    return horas > 23 ? null : { horas, minutos: 0 };
  }

  return null;
}

function aplicarMeridiano(
  horas: number,
  meridiano: string | undefined,
): number | null {
  if (!meridiano) return horas > 23 ? null : horas;

  if (horas < 1 || horas > 12) return null;
  const esTarde = meridiano.replace(/[.\s]/g, '').startsWith('p');
  if (esTarde) return horas === 12 ? 12 : horas + 12;
  return horas === 12 ? 0 : horas;
}
