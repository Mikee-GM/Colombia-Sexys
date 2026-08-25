import { DataSource } from 'typeorm';

/**
 * Ejecuta `task` solo si este proceso consigue el advisory lock de Postgres.
 *
 * Los ciclos periodicos (recordatorios, retos, contenido semanal) no son
 * idempotentes: con dos replicas del backend cada ciclo se ejecutaba dos veces
 * y el destinatario recibia el mensaje duplicado. `pg_try_advisory_lock` es no
 * bloqueante, asi que la replica que no obtiene el lock se salta el turno en
 * vez de esperar.
 *
 * Se usa Postgres en vez de Redis porque ya es una dependencia del sistema.
 *
 * @returns true si esta replica ejecuto la tarea, false si otra la tenia.
 */
export async function withAdvisoryLock(
  dataSource: DataSource,
  lockKey: number,
  task: () => Promise<void>,
): Promise<boolean> {
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  try {
    const [{ locked }]: Array<{ locked: boolean }> = await runner.query(
      'SELECT pg_try_advisory_lock($1) AS locked',
      [lockKey],
    );
    if (!locked) return false;

    try {
      await task();
    } finally {
      // El lock es de sesion, no de transaccion: hay que soltarlo en la misma
      // conexion que lo tomo, pase lo que pase dentro de la tarea.
      await runner.query('SELECT pg_advisory_unlock($1)', [lockKey]);
    }
    return true;
  } finally {
    await runner.release();
  }
}

/**
 * Claves de los locks. Constantes explicitas para que dos ciclos distintos no
 * colisionen por accidente al derivarlas de un nombre.
 */
export const ADVISORY_LOCKS = {
  serviceSchedule: 811_001,
  challenges: 811_002,
  weeklyContent: 811_003,
  onboardingReminders: 811_004,
  authCleanup: 811_005,
} as const;
