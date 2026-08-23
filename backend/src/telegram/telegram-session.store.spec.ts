import { Repository } from 'typeorm';
import { TelegramSession } from './entities/telegram-session.entity';
import { TelegramSessionStore } from './telegram-session.store';

type Row = { key: string; data: Record<string, unknown>; version: number };

/**
 * Repositorio en memoria que imita lo que importa aqui: la escritura solo surte
 * efecto si la version sigue siendo la esperada.
 */
function fakeRepository(rows = new Map<string, Row>()) {
  const repo = {
    rows,
    findOne: ({ where }: { where: { key: string } }) =>
      Promise.resolve(rows.get(where.key) ?? null),
    upsert: (value: Row) => {
      rows.set(value.key, { ...value });
      return Promise.resolve(undefined);
    },
    delete: (key: string) => {
      rows.delete(key);
      return Promise.resolve(undefined);
    },
    query: (_sql: string, params: unknown[]) => {
      const [key, data] = params as [string, string];
      if (rows.has(key)) return Promise.resolve([]);
      rows.set(key, {
        key,
        data: JSON.parse(data) as Record<string, unknown>,
        version: 1,
      });
      return Promise.resolve([{ key }]);
    },
    createQueryBuilder: () => {
      let payload: Record<string, unknown> = {};
      let target = '';
      let expected = 0;
      const builder = {
        update: () => builder,
        set: (value: Record<string, unknown>) => {
          payload = value;
          return builder;
        },
        where: (
          _clause: string,
          params: { key: string; expectedVersion: number },
        ) => {
          target = params.key;
          expected = params.expectedVersion;
          return builder;
        },
        execute: () => {
          const row = rows.get(target);
          if (!row || row.version !== expected)
            return Promise.resolve({ affected: 0 });
          rows.set(target, {
            key: target,
            data: payload.data as Record<string, unknown>,
            version: row.version + 1,
          });
          return Promise.resolve({ affected: 1 });
        },
      };
      return builder;
    },
  };
  return repo as unknown as Repository<TelegramSession> & { rows: typeof rows };
}

describe('TelegramSessionStore', () => {
  it('crea la sesión la primera vez y sube la versión', async () => {
    const repo = fakeRepository();
    const store = new TelegramSessionStore(repo);

    await store.get('s1');
    await store.set('s1', { paso: 'ubicacion' });

    expect(repo.rows.get('s1')).toMatchObject({
      data: { paso: 'ubicacion' },
      version: 1,
    });
  });

  it('conserva lo que escribió otro proceso en vez de pisarlo', async () => {
    const repo = fakeRepository();
    repo.rows.set('s1', { key: 's1', data: { paso: 'ubi' }, version: 3 });
    const store = new TelegramSessionStore(repo);

    // Este update lee el estado y añade `horas`...
    const leido = (await store.get('s1'))!;

    // ...mientras otro proceso guarda el método de pago.
    repo.rows.set('s1', {
      key: 's1',
      data: { paso: 'ubi', pago: 'efectivo' },
      version: 4,
    });

    await store.set('s1', { ...leido, horas: 2 });

    // Sobreviven los dos cambios, no solo el último en escribir.
    expect(repo.rows.get('s1')!.data).toEqual({
      paso: 'ubi',
      pago: 'efectivo',
      horas: 2,
    });
  });

  it('propaga el borrado de un campo al fusionar', async () => {
    const repo = fakeRepository();
    repo.rows.set('s1', {
      key: 's1',
      data: { paso: 'ubi', horas: 2 },
      version: 1,
    });
    const store = new TelegramSessionStore(repo);

    const leido = (await store.get('s1'))!;
    repo.rows.set('s1', {
      key: 's1',
      data: { paso: 'ubi', horas: 2, pago: 'efectivo' },
      version: 2,
    });

    const { horas: _quitado, ...sinHoras } = leido;
    await store.set('s1', sinHoras);

    expect(repo.rows.get('s1')!.data).toEqual({
      paso: 'ubi',
      pago: 'efectivo',
    });
  });

  it('escribe sin conflicto cuando nadie tocó la fila', async () => {
    const repo = fakeRepository();
    repo.rows.set('s1', { key: 's1', data: { paso: 'ubi' }, version: 7 });
    const store = new TelegramSessionStore(repo);

    const leido = (await store.get('s1'))!;
    await store.set('s1', { ...leido, horas: 3 });

    expect(repo.rows.get('s1')).toMatchObject({
      data: { paso: 'ubi', horas: 3 },
      version: 8,
    });
  });

  it('borra la sesión y su estado recordado', async () => {
    const repo = fakeRepository();
    repo.rows.set('s1', { key: 's1', data: { paso: 'ubi' }, version: 1 });
    const store = new TelegramSessionStore(repo);

    await store.get('s1');
    await store.delete('s1');

    expect(repo.rows.has('s1')).toBe(false);
  });
});
