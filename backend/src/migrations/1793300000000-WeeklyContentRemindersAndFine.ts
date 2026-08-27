import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recordatorios contados y multa automatica del contenido semanal.
 *
 * El ciclo anterior mandaba un unico recordatorio el sabado y el domingo
 * registraba un reporte de conducta. Eso no le decia nada a la modelo --no
 * sabia cuantos avisos llevaba ni que le iba a pasar-- y el reporte quedaba
 * esperando a que alguien lo revisara a mano.
 *
 * Ahora se cuentan los avisos dentro de la misma semana y, al tercero sin
 * fotos, se le carga una multa al corte. El importe vive en
 * `liquidation_settings` porque es un parametro del corte, no del calendario.
 */
export class WeeklyContentRemindersAndFine1793300000000
  implements MigrationInterface
{
  name = 'WeeklyContentRemindersAndFine1793300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "weekly_content_schedules"
        ADD COLUMN IF NOT EXISTS "recordatorios_enviados" integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "multa_aplicada_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "multa_liquidation_record_id" uuid;
    `);

    /*
     * Los ciclos que ya habian mandado su unico recordatorio arrancan con uno
     * contado, no con cero: si no, una modelo que ya recibio el aviso del
     * sabado volveria a empezar de cero y se le regalarian tres mas.
     */
    await queryRunner.query(`
      UPDATE "weekly_content_schedules"
         SET "recordatorios_enviados" = 1
       WHERE "recordatorio_at" IS NOT NULL
         AND "recordatorios_enviados" = 0;
    `);

    await queryRunner.query(`
      ALTER TABLE "liquidation_settings"
        ADD COLUMN IF NOT EXISTS "weekly_content_fine_amount" numeric(12,2)
          NOT NULL DEFAULT 300
          CHECK ("weekly_content_fine_amount" >= 0),
        ADD COLUMN IF NOT EXISTS "weekly_content_max_reminders" smallint
          NOT NULL DEFAULT 3
          CHECK ("weekly_content_max_reminders" >= 1
             AND "weekly_content_max_reminders" <= 10);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "liquidation_settings"
        DROP COLUMN IF EXISTS "weekly_content_fine_amount",
        DROP COLUMN IF EXISTS "weekly_content_max_reminders";
    `);
    await queryRunner.query(`
      ALTER TABLE "weekly_content_schedules"
        DROP COLUMN IF EXISTS "recordatorios_enviados",
        DROP COLUMN IF EXISTS "multa_aplicada_at",
        DROP COLUMN IF EXISTS "multa_liquidation_record_id";
    `);
  }
}
