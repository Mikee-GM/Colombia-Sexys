import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddScheduledServiceFields1787300000000 implements MigrationInterface {
  name = 'AddScheduledServiceFields1787300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "servicios"
        ADD COLUMN IF NOT EXISTS "fecha_programada" TIMESTAMP WITH TIME ZONE NULL,
        ADD COLUMN IF NOT EXISTS "tipo_agenda" VARCHAR(20) NOT NULL DEFAULT 'inmediato',
        ADD COLUMN IF NOT EXISTS "notificacion_previa_enviada" BOOLEAN NOT NULL DEFAULT false;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_servicios_fecha_programada"
        ON "servicios" ("estado", "fecha_programada")
        WHERE "fecha_programada" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_servicios_fecha_programada";
    `);

    await queryRunner.query(`
      ALTER TABLE "servicios"
        DROP COLUMN IF EXISTS "fecha_programada",
        DROP COLUMN IF EXISTS "tipo_agenda",
        DROP COLUMN IF EXISTS "notificacion_previa_enviada";
    `);
  }
}
