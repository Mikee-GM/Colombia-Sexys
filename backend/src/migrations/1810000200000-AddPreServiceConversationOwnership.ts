import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPreServiceConversationOwnership1810000200000 implements MigrationInterface {
  name = 'AddPreServiceConversationOwnership1810000200000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "conversaciones_telegram"
       ADD COLUMN IF NOT EXISTS "intended_employee_id" uuid`,
    );

    await queryRunner.query(
      `UPDATE "conversaciones_telegram" AS conversation
          SET "intended_employee_id" = service."empleada_id"
         FROM "servicios" AS service
        WHERE conversation."servicio_id" = service."id"
          AND conversation."intended_employee_id" IS NULL`,
    );

    await queryRunner.query(
      `UPDATE "conversaciones_telegram" AS conversation
          SET "intended_employee_id" = session_owner."employee_id"
         FROM (
           SELECT DISTINCT ON (session."data"->>'bookingSessionId')
                  session."data"->>'bookingSessionId' AS "booking_session_id",
                  employee."id" AS "employee_id"
             FROM "telegram_sessions" AS session
             JOIN "empleadas" AS employee
               ON employee."id"::text = session."data"->>'empleadaId'
            WHERE COALESCE(session."data"->>'bookingSessionId', '') <> ''
            ORDER BY session."data"->>'bookingSessionId', session."updated_at" DESC
         ) AS session_owner
        WHERE conversation."booking_session_id"::text = session_owner."booking_session_id"
          AND conversation."intended_employee_id" IS NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_conversaciones_intended_employee"
       ON "conversaciones_telegram" ("intended_employee_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_conversaciones_booking_unlinked"
       ON "conversaciones_telegram" ("booking_session_id", "enviado_at" DESC)
       WHERE "servicio_id" IS NULL AND "booking_session_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `DO $$
       BEGIN
         IF NOT EXISTS (
           SELECT 1
             FROM pg_constraint
            WHERE conname = 'fk_conversaciones_intended_employee'
         ) THEN
           ALTER TABLE "conversaciones_telegram"
             ADD CONSTRAINT "fk_conversaciones_intended_employee"
             FOREIGN KEY ("intended_employee_id")
             REFERENCES "empleadas"("id")
             ON DELETE SET NULL;
         END IF;
       END
       $$`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "conversaciones_telegram"
       DROP CONSTRAINT IF EXISTS "fk_conversaciones_intended_employee"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_conversaciones_booking_unlinked"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_conversaciones_intended_employee"`,
    );
    await queryRunner.query(
      `ALTER TABLE "conversaciones_telegram"
       DROP COLUMN IF EXISTS "intended_employee_id"`,
    );
  }
}
