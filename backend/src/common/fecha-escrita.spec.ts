import { interpretarFechaEscrita } from './fecha-escrita';

/**
 * El jefe escribe la hora de la cita a mano. Antes solo podia decir
 * "programado" y el servicio nacia siempre con la misma hora de marcador: una
 * hora a partir de ese momento, fuera para cuando fuera la cita.
 */
describe('interpretarFechaEscrita', () => {
  // Lunes 21 de septiembre de 2026, 10:00 de la manana en Mexico.
  const AHORA = new Date('2026-09-21T16:00:00Z');

  const enMexico = (fecha: Date | null) =>
    fecha?.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }) ?? null;

  it('entiende una hora en 24 h como hoy mismo', () => {
    expect(enMexico(interpretarFechaEscrita('14:30', AHORA))).toBe(
      '21/9/2026, 2:30:00 p.m.',
    );
  });

  it('entiende el meridiano', () => {
    expect(enMexico(interpretarFechaEscrita('2:30 pm', AHORA))).toBe(
      '21/9/2026, 2:30:00 p.m.',
    );
    expect(enMexico(interpretarFechaEscrita('8pm', AHORA))).toBe(
      '21/9/2026, 8:00:00 p.m.',
    );
  });

  /*
   * "A las 9" cuando ya son las diez solo puede significar manana. Interpretarlo
   * como hoy daria una cita en el pasado, que el servicio rechaza, y el jefe se
   * quedaria sin saber por que.
   */
  it('pasa a manana una hora que ya paso hoy', () => {
    expect(enMexico(interpretarFechaEscrita('9am', AHORA))).toBe(
      '22/9/2026, 9:00:00 a.m.',
    );
  });

  it('entiende manana y pasado manana', () => {
    expect(enMexico(interpretarFechaEscrita('manana 14:00', AHORA))).toBe(
      '22/9/2026, 2:00:00 p.m.',
    );
    expect(enMexico(interpretarFechaEscrita('mañana a las 2pm', AHORA))).toBe(
      '22/9/2026, 2:00:00 p.m.',
    );
    expect(enMexico(interpretarFechaEscrita('pasado mañana 9:00', AHORA))).toBe(
      '23/9/2026, 9:00:00 a.m.',
    );
  });

  it('entiende un dia concreto con barras', () => {
    expect(enMexico(interpretarFechaEscrita('25/09 20:00', AHORA))).toBe(
      '25/9/2026, 8:00:00 p.m.',
    );
    expect(enMexico(interpretarFechaEscrita('3/10/2026 11:30', AHORA))).toBe(
      '3/10/2026, 11:30:00 a.m.',
    );
  });

  it('lleva al ano siguiente un dia sin ano que ya paso', () => {
    expect(enMexico(interpretarFechaEscrita('15/03 18:00', AHORA))).toBe(
      '15/3/2027, 6:00:00 p.m.',
    );
  });

  /*
   * Las dos formas de escribir una hora con punto no se pueden confundir con
   * una fecha: por eso la fecha solo se reconoce con barras.
   */
  it('no confunde una hora con punto con una fecha', () => {
    expect(enMexico(interpretarFechaEscrita('14.30', AHORA))).toBe(
      '21/9/2026, 2:30:00 p.m.',
    );
  });

  it('acepta la forma "20h"', () => {
    expect(enMexico(interpretarFechaEscrita('a las 20h', AHORA))).toBe(
      '21/9/2026, 8:00:00 p.m.',
    );
  });

  /*
   * Devolver null y volver a preguntar es lo correcto: adivinar una hora manda
   * a la modelo al motel el dia que no es.
   */
  it('devuelve null cuando no hay una hora reconocible', () => {
    expect(interpretarFechaEscrita('en la tarde', AHORA)).toBeNull();
    expect(interpretarFechaEscrita('mañana', AHORA)).toBeNull();
    expect(interpretarFechaEscrita('', AHORA)).toBeNull();
    expect(interpretarFechaEscrita('25/09', AHORA)).toBeNull();
  });

  it('rechaza horas y fechas imposibles', () => {
    expect(interpretarFechaEscrita('99:99', AHORA)).toBeNull();
    expect(interpretarFechaEscrita('25:00', AHORA)).toBeNull();
    expect(interpretarFechaEscrita('45/13 10:00', AHORA)).toBeNull();
    expect(interpretarFechaEscrita('15 pm', AHORA)).toBeNull();
  });

  it('siempre devuelve una fecha futura', () => {
    for (const texto of ['9am', '14:30', 'manana 8am', '15/03 18:00']) {
      const resultado = interpretarFechaEscrita(texto, AHORA);
      expect(resultado).not.toBeNull();
      expect(resultado!.getTime()).toBeGreaterThan(AHORA.getTime());
    }
  });

  it('da el mismo instante corra el proceso donde corra', () => {
    const zonaOriginal = process.env.TZ;
    const enUtc = interpretarFechaEscrita('manana 14:00', AHORA)!.getTime();
    process.env.TZ = 'Asia/Tokyo';
    const enTokio = interpretarFechaEscrita('manana 14:00', AHORA)!.getTime();
    process.env.TZ = zonaOriginal;

    expect(enTokio).toBe(enUtc);
  });
});
