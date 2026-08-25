import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Indices para el barrido periodico de `auth_sessions`.
 *
 * Cada refresco rota la sesion y deja una fila revocada, asi que la tabla es de
 * las que mas crecen. El barrido horario busca por `expires_at` y por
 * `revoked_at`, y sin indice recorre la tabla entera cada vez.
 *
 * Los dos indices son de columna suelta y no uno parcial sobre la condicion del
 * barrido: esa condicion usa `now()`, que no es inmutable, y Postgres no admite
 * funciones volatiles en el predicado de un indice. Con estos dos, el OR del
 * DELETE se resuelve como BitmapOr.
 *
 * El de `revoked_at` si es parcial, con `IS NOT NULL`: las sesiones vivas son
 * la mayoria y no aportan nada a esta busqueda, asi que el indice queda mucho
 * mas pequeño.
 */
export class AddAuthSessionsCleanupIndexes1793000000000 implements MigrationInterface {
  name = 'AddAuthSessionsCleanupIndexes1793000000000';

  /**
   * Sin transaccion: CREATE INDEX CONCURRENTLY no puede ejecutarse dentro de
   * una, y sobre una tabla de sesiones no conviene la variante normal, que
   * bloquea las escrituras mientras construye. Requiere que el DataSource use
   * `migrationsTransactionMode: 'each'`.
   */
  transaction = false as const;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Una construccion concurrente que falla deja el indice en estado invalido,
    // y `IF NOT EXISTS` lo daria por bueno sin rehacerlo. Se limpian primero.
    await this.dropInvalid(queryRunner, 'idx_auth_sessions_expires_at');
    await this.dropInvalid(queryRunner, 'idx_auth_sessions_revoked_at');

    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_auth_sessions_expires_at"
         ON public.auth_sessions ("expires_at")`,
    );

    await queryRunner.query(
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_auth_sessions_revoked_at"
         ON public.auth_sessions ("revoked_at")
         WHERE "revoked_at" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS public."idx_auth_sessions_revoked_at"`,
    );
    await queryRunner.query(
      `DROP INDEX CONCURRENTLY IF EXISTS public."idx_auth_sessions_expires_at"`,
    );
  }

  private async dropInvalid(
    queryRunner: QueryRunner,
    indexName: string,
  ): Promise<void> {
    const rows: Array<{ invalido: boolean }> = await queryRunner.query(
      `SELECT NOT i.indisvalid AS invalido
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_index i ON i.indexrelid = c.oid
        WHERE c.relname = $1 AND n.nspname = 'public'`,
      [indexName],
    );

    if (rows[0]?.invalido) {
      await queryRunner.query(
        `DROP INDEX CONCURRENTLY IF EXISTS public."${indexName}"`,
      );
    }
  }
}
