import { desdeHoraDelNegocio, enHoraDelNegocio } from './locale';

/**
 * La hora pactada por chat llega como texto sin zona, y eso ya costo una cita:
 * "manana a las 2 pm" se guardo como las 8 de la manana porque el servidor de
 * produccion corre en UTC y `new Date` lee un texto sin zona como hora local.
 */
describe('desdeHoraDelNegocio', () => {
  const zonaOriginal = process.env.TZ;

  afterEach(() => {
    process.env.TZ = zonaOriginal;
  });

  it('interpreta un texto sin zona como hora de Mexico', () => {
    const instante = desdeHoraDelNegocio('2026-09-21T14:00:00');

    expect(instante).not.toBeNull();
    expect(
      instante!.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
    ).toBe('21/9/2026, 2:00:00 p.m.');
  });

  it('da el mismo instante corra el servidor donde corra', () => {
    const enUtc = desdeHoraDelNegocio('2026-09-21T14:00:00')!.getTime();

    // El mismo texto, leido por un proceso con otra zona del sistema.
    process.env.TZ = 'Asia/Tokyo';
    const enTokio = desdeHoraDelNegocio('2026-09-21T14:00:00')!.getTime();

    expect(enTokio).toBe(enUtc);
  });

  it('es el inverso de enHoraDelNegocio', () => {
    const instante = desdeHoraDelNegocio('2026-09-21T14:30:15')!;
    const leido = enHoraDelNegocio(instante);

    expect(leido.toISOString()).toBe('2026-09-21T14:30:15.000Z');
  });

  it('respeta un texto que ya trae zona', () => {
    const instante = desdeHoraDelNegocio('2026-09-21T14:00:00Z');

    expect(instante!.toISOString()).toBe('2026-09-21T14:00:00.000Z');
  });

  it('acepta un texto sin segundos, como el que da datetime-local', () => {
    const instante = desdeHoraDelNegocio('2026-09-21T14:00');

    expect(
      instante!.toLocaleString('es-MX', { timeZone: 'America/Mexico_City' }),
    ).toBe('21/9/2026, 2:00:00 p.m.');
  });

  it('devuelve null en vez de una fecha invalida silenciosa', () => {
    expect(desdeHoraDelNegocio('manana a las dos')).toBeNull();
    expect(desdeHoraDelNegocio('')).toBeNull();
  });
});
