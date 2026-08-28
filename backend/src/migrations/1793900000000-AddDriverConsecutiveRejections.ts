import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Racha de ofertas rechazadas seguidas por un chofer.
 *
 * Se guarda en la fila del chofer y no se deriva de los viajes porque lo que
 * importa es la racha ACTUAL: aceptar una oferta la borra. Reconstruirla cada
 * vez leyendo el historial obligaria a definir sobre que ventana se cuenta, y
 * el dato que se quiere avisar es simplemente "van tres seguidas".
 */
export class AddDriverConsecutiveRejections1793900000000 implements MigrationInterface {
  name = 'AddDriverConsecutiveRejections1793900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "choferes"
         ADD COLUMN IF NOT EXISTS "rechazos_consecutivos" integer NOT NULL DEFAULT 0,
         ADD COLUMN IF NOT EXISTS "ultimo_rechazo_at" timestamp with time zone`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "choferes"
         DROP COLUMN IF EXISTS "ultimo_rechazo_at",
         DROP COLUMN IF EXISTS "rechazos_consecutivos"`,
    );
  }
}
