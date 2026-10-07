import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Enlace aditivo entre la solicitud temporal y el servicio persistente.
 *
 * Los servicios históricos y los creados fuera de Telegram permanecen
 * compatibles porque la columna acepta NULL. El backfill usa el historial
 * existente cuando hay una única booking session inequívoca.
 */
export class AddBookingSessionToServices1810000300000 implements MigrationInterface {
  name = 'AddBookingSessionToServices1810000300000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "servicios"
       ADD COLUMN IF NOT EXISTS "booking_session_id" uuid`,
    );

    await queryRunner.query(
      `UPDATE "servicios" AS service
          SET "booking_session_id" = history."booking_session_id"
         FROM (
           SELECT conversation."servicio_id",
                  min(conversation."booking_session_id"::text)::uuid AS "booking_session_id"
             FROM "conversaciones_telegram" AS conversation
            WHERE conversation."servicio_id" IS NOT NULL
              AND conversation."booking_session_id" IS NOT NULL
            GROUP BY conversation."servicio_id"
           HAVING COUNT(DISTINCT conversation."booking_session_id") = 1
         ) AS history
        WHERE service."id" = history."servicio_id"
          AND service."booking_session_id" IS NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_servicios_booking_session"
       ON "servicios" ("booking_session_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_servicios_booking_session"`,
    );
    await queryRunner.query(
      `ALTER TABLE "servicios" DROP COLUMN IF EXISTS "booking_session_id"`,
    );
  }
}
