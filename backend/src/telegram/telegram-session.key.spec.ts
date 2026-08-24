import { buildSessionKey } from './telegram-session.key';

describe('buildSessionKey', () => {
  it('usa cliente y chat en el bot central', () => {
    expect(buildSessionKey({ from: { id: 7 }, chat: { id: 9 } })).toBe('7:9');
  });

  /**
   * El fallo que cubre esta prueba: la escritura de la sesion armaba la clave
   * sin el prefijo de la empleada, asi que en el bot dedicado de una modelo
   * guardaba en una fila distinta de la que leia el middleware. El cliente lo
   * veia como un bot que le volvia a preguntar las horas que acababa de dar.
   */
  it('antepone la empleada en el bot dedicado', () => {
    expect(
      buildSessionKey({
        from: { id: 7 },
        chat: { id: 9 },
        dedicatedBotEmployeeId: 'emp-1',
      }),
    ).toBe('emp-1:7:9');
  });

  it('distingue a la misma persona hablando con dos modelos', () => {
    const conUna = buildSessionKey({
      from: { id: 7 },
      chat: { id: 9 },
      dedicatedBotEmployeeId: 'emp-1',
    });
    const conOtra = buildSessionKey({
      from: { id: 7 },
      chat: { id: 9 },
      dedicatedBotEmployeeId: 'emp-2',
    });
    expect(conUna).not.toBe(conOtra);
  });

  it('no devuelve clave sin remitente o sin chat', () => {
    expect(buildSessionKey({ chat: { id: 9 } })).toBeUndefined();
    expect(buildSessionKey({ from: { id: 7 } })).toBeUndefined();
  });
});
