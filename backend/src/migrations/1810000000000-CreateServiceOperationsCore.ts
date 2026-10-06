import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateServiceOperationsCore1810000000000 implements MigrationInterface {
  name = 'CreateServiceOperationsCore1810000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "servicios"
        ADD COLUMN IF NOT EXISTS "estado_operativo" varchar(50),
        ADD COLUMN IF NOT EXISTS "aceptacion_empleada_expira_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "aceptacion_empleada_recordada_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "aceptacion_empleada_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "aceptacion_empleada_escalada_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "aviso_fin_proximo_at" timestamptz;
    `);
    await queryRunner.query(`
      UPDATE "servicios"
         SET "estado_operativo" = CASE
           WHEN "estado" = 'agendado' THEN 'asignado'
           WHEN "estado" = 'en_curso' THEN 'en_curso'
           WHEN "estado" = 'finalizado' AND "hora_llegada_casa" IS NULL
             THEN 'preparando_regreso'
           WHEN "estado" = 'finalizado' THEN 'finalizado'
           WHEN "estado" = 'cancelado' THEN 'cancelado'
           ELSE 'preparacion'
         END
       WHERE "estado_operativo" IS NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE "servicios"
        ALTER COLUMN "estado_operativo" SET DEFAULT 'preparacion',
        ALTER COLUMN "estado_operativo" SET NOT NULL;
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
           WHERE conname = 'chk_servicios_estado_operativo'
             AND conrelid = 'servicios'::regclass
        ) THEN
          ALTER TABLE "servicios"
            ADD CONSTRAINT "chk_servicios_estado_operativo"
            CHECK ("estado_operativo" IN (
              'preparacion', 'preparado', 'asignado',
              'esperando_aceptacion_empleada', 'aceptado',
              'esperando_transporte_ida', 'transporte_ida_asignado',
              'empleada_en_camino', 'empleada_llego', 'en_curso',
              'preparando_regreso', 'transporte_regreso_asignado',
              'empleada_de_regreso', 'finalizado', 'rechazado',
              'cancelado', 'expirado'
            ));
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_servicios_estado_operativo"
        ON "servicios" ("estado_operativo");
      CREATE INDEX IF NOT EXISTS "idx_servicios_aceptacion_expira"
        ON "servicios" ("aceptacion_empleada_expira_at")
        WHERE "estado_operativo" = 'esperando_aceptacion_empleada';
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "service_operation_events" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "service_id" uuid NOT NULL REFERENCES "servicios"("id") ON DELETE CASCADE,
        "type" varchar(80) NOT NULL,
        "from_state" varchar(50),
        "to_state" varchar(50),
        "actor_user_id" uuid,
        "actor_type" varchar(30) NOT NULL DEFAULT 'system'
          CHECK ("actor_type" IN ('system', 'jefe', 'empleada', 'chofer', 'admin')),
        "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "occurred_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "idx_service_operation_events_service_time"
        ON "service_operation_events" ("service_id", "occurred_at");
      CREATE INDEX IF NOT EXISTS "idx_service_operation_events_type_time"
        ON "service_operation_events" ("type", "occurred_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "service_operation_events"`);
    await queryRunner.query(`
      ALTER TABLE "servicios"
        DROP COLUMN IF EXISTS "aviso_fin_proximo_at",
        DROP COLUMN IF EXISTS "aceptacion_empleada_escalada_at",
        DROP COLUMN IF EXISTS "aceptacion_empleada_at",
        DROP COLUMN IF EXISTS "aceptacion_empleada_recordada_at",
        DROP COLUMN IF EXISTS "aceptacion_empleada_expira_at",
        DROP COLUMN IF EXISTS "estado_operativo";
    `);
  }
}
