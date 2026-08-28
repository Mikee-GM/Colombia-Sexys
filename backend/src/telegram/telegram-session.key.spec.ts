import { buildSessionKey, parseSessionKey } from './telegram-session.key';

describe('buildSessionKey', () => {
  it('usa cliente y chat', () => {
    expect(buildSessionKey({ from: { id: 7 }, chat: { id: 9 } })).toBe('7:9');
  });

  it('no devuelve clave sin remitente o sin chat', () => {
    expect(buildSessionKey({ chat: { id: 9 } })).toBeUndefined();
    expect(buildSessionKey({ from: { id: 7 } })).toBeUndefined();
  });
});

describe('parseSessionKey', () => {
  it('separa una clave normal', () => {
    expect(parseSessionKey('7:9')).toEqual({ fromId: '7', chatId: '9' });
  });

  /**
   * El fallo que cubre esta prueba: el puente jefe -> cliente sacaba el
   * destinatario con `key.split(':')[0]`, que en una sesion guardada por un bot
   * dedicado es el id de la EMPLEADA. El mensaje del jefe salia hacia un
   * destinatario inexistente y el cliente no recibia nunca la respuesta.
   *
   * Los bots dedicados ya no existen, pero las sesiones viven 30 dias: mientras
   * queden filas con el formato viejo hay que seguir entendiendolas.
   */
  it('separa la empleada del cliente en una clave heredada', () => {
    expect(parseSessionKey('emp-1:7:9')).toEqual({
      employeeId: 'emp-1',
      fromId: '7',
      chatId: '9',
    });
  });

  it('deshace exactamente lo que arma buildSessionKey', () => {
    const key = buildSessionKey({ from: { id: 7 }, chat: { id: 9 } })!;
    expect(parseSessionKey(key)).toEqual({ fromId: '7', chatId: '9' });
  });

  it('rechaza una clave con un numero de piezas que no reconoce', () => {
    expect(parseSessionKey('sinpiezas')).toBeNull();
    expect(parseSessionKey('a:b:c:d')).toBeNull();
  });
});
