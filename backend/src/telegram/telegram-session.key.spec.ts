import { buildSessionKey, parseSessionKey } from './telegram-session.key';

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

describe('parseSessionKey', () => {
  it('separa una clave del bot central', () => {
    expect(parseSessionKey('7:9')).toEqual({ fromId: '7', chatId: '9' });
  });

  /**
   * El fallo que cubre esta prueba: el puente jefe -> cliente sacaba el
   * destinatario con `key.split(':')[0]`, que en una sesion de bot dedicado es
   * el id de la EMPLEADA. El mensaje del jefe salia hacia un destinatario
   * inexistente y el cliente no recibia nunca la respuesta.
   */
  it('separa la empleada del cliente en una clave de bot dedicado', () => {
    expect(parseSessionKey('emp-1:7:9')).toEqual({
      employeeId: 'emp-1',
      fromId: '7',
      chatId: '9',
    });
  });

  it('deshace exactamente lo que arma buildSessionKey', () => {
    const key = buildSessionKey({
      from: { id: 7 },
      chat: { id: 9 },
      dedicatedBotEmployeeId: 'emp-1',
    })!;
    expect(parseSessionKey(key)).toEqual({
      employeeId: 'emp-1',
      fromId: '7',
      chatId: '9',
    });
  });

  it('rechaza una clave con un numero de piezas que no reconoce', () => {
    expect(parseSessionKey('sinpiezas')).toBeNull();
    expect(parseSessionKey('a:b:c:d')).toBeNull();
  });
});
