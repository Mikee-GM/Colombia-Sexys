import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Distingue los dos motivos por los que una empleada pide un registro manual.
 *
 * Hasta ahora la tabla solo servia para un servicio que YA habia ocurrido: la
 * validacion rechazaba cualquier fecha futura y el servicio nacia directamente
 * en `finalizado`. Pero el caso mas util no era ese: la empleada cuadra un
 * cliente por su cuenta y necesita que el jefe le abra el servicio ANTES de
 * hacerlo, para que corra con su transporte y su cierre normales.
 *
 * `pasado` es lo que habia y sigue siendo el valor por defecto, asi que las
 * filas existentes conservan su significado.
 */
export class AddTipoToSolicitudesServicioManual1801000000000 implements MigrationInterface {
  name = 'AddTipoToSolicitudesServicioManual1801000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "solicitudes_servicio_manual"
      ADD COLUMN IF NOT EXISTS "tipo" character varying(20) NOT NULL DEFAULT 'pasado';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "solicitudes_servicio_manual"
      DROP COLUMN IF EXISTS "tipo";
    `);
  }
}
