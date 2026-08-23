import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { TelegramSession } from './entities/telegram-session.entity';

type SessionData = Record<string, unknown>;

/**
 * Almacen de sesiones de Telegraf con escritura condicional.
 *
 * Telegraf lee la sesion al empezar el update y la escribe entera al terminar.
 * Como Telegram entrega los updates en paralelo, dos mensajes del mismo cliente
 * pueden solaparse: los dos leen el mismo estado de partida y el ultimo `set`
 * pisa por completo al primero. El cliente lo ve como un bot que olvido el paso
 * anterior.
 *
 * Aqui se corrige de dos formas complementarias:
 *
 *  - Se recuerda el estado tal y como se leyo (`baseline`), asi que al escribir
 *    se sabe *que* cambio este update concreto, no solo como quedo el objeto.
 *  - La escritura exige que la version de la fila siga siendo la leida. Si otro
 *    proceso la toco por medio, se relee y se aplican encima unicamente los
 *    cambios de este update, en vez de sobreescribir su trabajo.
 *
 * El cerrojo en memoria de `serializeBySessionKey` evita la mayor parte de los
 * conflictos dentro de un proceso; esto cubre lo que queda cuando hay mas de
 * uno.
 */
export class TelegramSessionStore {
  private readonly logger = new Logger(TelegramSessionStore.name);

  /**
   * Estado y version tal y como se leyeron, por clave de sesion.
   *
   * Asume un `get` seguido de un `set` por cada update, que es lo que garantiza
   * el cerrojo de `serializeBySessionKey`. Si ese cerrojo cede por su plazo
   * maximo —un manejador colgado mas de 45 s—, dos updates podrian pisarse el
   * punto de partida; el resultado seria entonces el mismo que antes de todo
   * esto, no algo peor.
   */
  private readonly baselines = new Map<
    string,
    { version: number; data: SessionData }
  >();

  constructor(private readonly repository: Repository<TelegramSession>) {}

  get = async (key: string): Promise<SessionData | undefined> => {
    const row = await this.repository.findOne({ where: { key } });
    const data = (row?.data ?? undefined) as SessionData | undefined;
    this.baselines.set(key, {
      version: row?.version ?? 0,
      data: clone(data ?? {}),
    });
    return data;
  };

  set = async (key: string, data: SessionData): Promise<void> => {
    const baseline = this.baselines.get(key);
    this.baselines.delete(key);

    // Sin baseline no hubo `get` previo (o ya se consumio): no hay nada con lo
    // que comparar, asi que se escribe tal cual.
    if (!baseline) {
      await this.repository.upsert(
        { key, data, version: 1 } as QueryDeepPartialEntity<TelegramSession>,
        ['key'],
      );
      return;
    }

    const applied = await this.writeIfUnchanged(key, data, baseline.version);
    if (applied) return;

    // Otro proceso escribio esta sesion mientras corria el update. Se relee y
    // se aplica encima solo lo que cambio aqui, para no borrar lo suyo.
    const current = await this.repository.findOne({ where: { key } });
    const merged = applyChanges(
      (current?.data ?? {}) as SessionData,
      baseline.data,
      data,
    );
    const mergedApplied = await this.writeIfUnchanged(
      key,
      merged,
      current?.version ?? 0,
    );
    if (!mergedApplied) {
      // Dos conflictos seguidos sobre la misma sesion es un caso raro y no
      // merece una tercera vuelta: se escribe y se deja constancia.
      await this.repository.upsert(
        {
          key,
          data: merged,
          version: (current?.version ?? 0) + 1,
        } as QueryDeepPartialEntity<TelegramSession>,
        ['key'],
      );
      this.logger.warn(
        `Sesion ${key}: dos conflictos seguidos al guardar, se forzo la escritura.`,
      );
    }
  };

  delete = async (key: string): Promise<void> => {
    this.baselines.delete(key);
    await this.repository.delete(key);
  };

  /**
   * Escribe solo si la fila sigue en la version esperada. Devuelve `false` si
   * alguien la cambio por medio.
   */
  private async writeIfUnchanged(
    key: string,
    data: SessionData,
    expectedVersion: number,
  ): Promise<boolean> {
    if (expectedVersion === 0) {
      // La sesion no existia al leerla. `ON CONFLICT DO NOTHING` distingue el
      // caso de que otro proceso la haya creado mientras tanto.
      const inserted: Array<unknown> = await this.repository.query(
        `INSERT INTO telegram_sessions (key, data, version, updated_at)
         VALUES ($1, $2, 1, now())
         ON CONFLICT (key) DO NOTHING
         RETURNING key`,
        [key, JSON.stringify(data)],
      );
      return inserted.length > 0;
    }

    const result = await this.repository
      .createQueryBuilder()
      .update(TelegramSession)
      .set({
        data,
        version: () => 'version + 1',
      } as QueryDeepPartialEntity<TelegramSession>)
      .where('key = :key AND version = :expectedVersion', {
        key,
        expectedVersion,
      })
      .execute();
    return (result.affected ?? 0) > 0;
  }
}

function clone(value: SessionData): SessionData {
  return JSON.parse(JSON.stringify(value)) as SessionData;
}

/**
 * Reaplica sobre `current` los cambios que este update hizo entre `baseline` y
 * `next`: las claves que anadio o modifico se copian, y las que borro se
 * quitan. Lo que toco el otro proceso y este no, se conserva.
 */
function applyChanges(
  current: SessionData,
  baseline: SessionData,
  next: SessionData,
): SessionData {
  const merged: SessionData = { ...current };

  for (const [field, value] of Object.entries(next)) {
    if (!deepEqual(baseline[field], value)) merged[field] = value;
  }
  for (const field of Object.keys(baseline)) {
    if (!(field in next)) delete merged[field];
  }
  return merged;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
