import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWeeklyContentAndPrivatePhotos1785800000000
  implements MigrationInterface
{
  name = 'CreateWeeklyContentAndPrivatePhotos1785800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Crear tabla empleada_fotos_exclusivas
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "empleada_fotos_exclusivas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empleada_id" uuid NOT NULL,
        "url" text NOT NULL,
        "orden" smallint NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "empleada_fotos_exclusivas_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_empleada_fotos_exclusivas_empleada_id" FOREIGN KEY ("empleada_id") REFERENCES "empleadas"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      );
      CREATE INDEX IF NOT EXISTS "idx_empleada_fotos_exclusivas_empleada" ON "empleada_fotos_exclusivas" ("empleada_id");
    `);

    // 2. Crear tabla weekly_photo_submissions
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "weekly_photo_submissions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empleada_id" uuid NOT NULL,
        "url" text NOT NULL,
        "estado" character varying(30) NOT NULL DEFAULT 'pendiente',
        "semana_inicio" date,
        "revisado_por_user_id" uuid,
        "revisado_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "weekly_photo_submissions_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_weekly_photo_submissions_empleada_id" FOREIGN KEY ("empleada_id") REFERENCES "empleadas"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_weekly_photo_submissions_revisado_user" FOREIGN KEY ("revisado_por_user_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      );
      CREATE INDEX IF NOT EXISTS "idx_weekly_photo_submissions_empleada" ON "weekly_photo_submissions" ("empleada_id");
      CREATE INDEX IF NOT EXISTS "idx_weekly_photo_submissions_estado" ON "weekly_photo_submissions" ("estado");
    `);

    // 3. Crear tabla weekly_content_schedules
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "weekly_content_schedules" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "empleada_id" uuid NOT NULL,
        "semana_inicio" date NOT NULL,
        "estado" character varying(30) NOT NULL DEFAULT 'solicitado',
        "solicitado_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "recordatorio_at" TIMESTAMP WITH TIME ZONE,
        "falta_at" TIMESTAMP WITH TIME ZONE,
        "entregado_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "weekly_content_schedules_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_weekly_content_schedules_empleada_semana" UNIQUE ("empleada_id", "semana_inicio"),
        CONSTRAINT "FK_weekly_content_schedules_empleada_id" FOREIGN KEY ("empleada_id") REFERENCES "empleadas"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      );
      CREATE INDEX IF NOT EXISTS "idx_weekly_content_schedules_empleada" ON "weekly_content_schedules" ("empleada_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "weekly_content_schedules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "weekly_photo_submissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "empleada_fotos_exclusivas"`);
  }
}
