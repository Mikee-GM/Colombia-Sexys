import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Indice para la purga periodica de sesiones de Telegram. El barrido filtra por
 * `updated_at`, y sin indice tendria que recorrer la tabla entera cada vez.
 */
export class AddTelegramSessionUpdatedAtIndex1792100000000 implements MigrationInterface {
  name = 'AddTelegramSessionUpdatedAtIndex1792100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_telegram_sessions_updated_at
         ON public.telegram_sessions (updated_at)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS public.idx_telegram_sessions_updated_at`,
    );
  }
}
