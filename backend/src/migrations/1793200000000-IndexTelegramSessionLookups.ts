import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Indices para buscar sesiones de Telegram por su contenido.
 *
 * El puente entre el jefe y el cliente localizaba la sesion trayendo la tabla
 * ENTERA y filtrando en memoria, y lo hacia en el camino de cada mensaje que el
 * jefe escribe en un tema del grupo. Las sesiones viven 30 dias y cada fila
 * lleva su historial de conversacion en JSONB, asi que eso eran megabytes por
 * mensaje. Con la condicion ya en SQL, estos indices de expresion son los que
 * evitan que siga siendo un recorrido completo.
 */
export class IndexTelegramSessionLookups1793200000000 implements MigrationInterface {
  name = 'IndexTelegramSessionLookups1793200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Parcial: solo interesan las sesiones que de verdad cuelgan de un tema,
    // que son una minoria. El indice queda pequeño y cabe en memoria.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_telegram_sessions_boss_thread"
        ON "telegram_sessions" (("data"->>'bossThreadId'), ("data"->>'bossGroupId'))
        WHERE "data"->>'bossThreadId' IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_telegram_sessions_esperando_empleada"
        ON "telegram_sessions" (("data"->>'esperandoEmpleadaId'))
        WHERE "data"->>'esperandoEmpleadaId' IS NOT NULL
    `);
    // La purga periodica borra por antiguedad y tambien recorria la tabla.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_telegram_sessions_updated_at"
        ON "telegram_sessions" ("updated_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_telegram_sessions_updated_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_telegram_sessions_esperando_empleada"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_telegram_sessions_boss_thread"`,
    );
  }
}
