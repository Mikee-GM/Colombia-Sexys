import { serializeBySessionKey } from './telegram-session.lock';

const key = (ctx: unknown) => (ctx as { key?: string }).key;

/** Deja correr las promesas pendientes sin avanzar los temporizadores. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('serializeBySessionKey', () => {
  it('procesa en fila dos updates de la misma sesión', async () => {
    const middleware = serializeBySessionKey(key);
    const order: string[] = [];
    let liberarPrimero!: () => void;

    const primero = middleware({ key: 's1' }, async () => {
      order.push('entra 1');
      await new Promise<void>((r) => {
        liberarPrimero = r;
      });
      order.push('sale 1');
    });
    const segundo = middleware({ key: 's1' }, () => {
      order.push('entra 2');
      return Promise.resolve();
    });

    await flush();
    // El segundo todavía no ha empezado: espera a que el primero termine.
    expect(order).toEqual(['entra 1']);

    liberarPrimero();
    await Promise.all([primero, segundo]);
    expect(order).toEqual(['entra 1', 'sale 1', 'entra 2']);
  });

  it('no hace esperar a sesiones distintas', async () => {
    const middleware = serializeBySessionKey(key);
    const order: string[] = [];
    let liberar!: () => void;

    const otra = middleware({ key: 's1' }, async () => {
      order.push('entra s1');
      await new Promise<void>((r) => {
        liberar = r;
      });
    });
    const propia = middleware({ key: 's2' }, () => {
      order.push('entra s2');
      return Promise.resolve();
    });

    await propia;
    expect(order).toEqual(['entra s1', 'entra s2']);

    liberar();
    await otra;
  });

  it('libera el turno aunque el manejador falle', async () => {
    const middleware = serializeBySessionKey(key);
    const order: string[] = [];

    await expect(
      middleware({ key: 's1' }, () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');

    await middleware({ key: 's1' }, () => {
      order.push('el siguiente entra igual');
      return Promise.resolve();
    });
    expect(order).toEqual(['el siguiente entra igual']);
  });

  it('deja pasar el update cuando no hay clave de sesión', async () => {
    const middleware = serializeBySessionKey(key);
    const order: string[] = [];

    await middleware({}, () => {
      order.push('sin clave');
      return Promise.resolve();
    });
    expect(order).toEqual(['sin clave']);
  });

  it('no acumula entradas muertas al terminar', async () => {
    const middleware = serializeBySessionKey(key);
    for (let i = 0; i < 50; i++) {
      await middleware({ key: `s${i}` }, () => Promise.resolve());
    }
    // Una segunda vuelta sobre las mismas claves no debe esperar a nada.
    const start = Date.now();
    await middleware({ key: 's0' }, () => Promise.resolve());
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
