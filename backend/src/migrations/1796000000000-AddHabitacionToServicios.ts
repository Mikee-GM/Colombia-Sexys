import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega el campo `habitacion` a la tabla `servicios`.
 *
 * Permite registrar el número de habitación o detalle específico de la
 * ubicación cuando la empleada acepta un servicio o cuando se visualiza
 * en el detalle operativo del servicio.
 */
export class AddHabitacionToServicios1796000000000
  implements MigrationInterface
{
  name = 'AddHabitacionToServicios1796000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "servicios"
      ADD COLUMN IF NOT EXISTS "habitacion" character varying(50);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "servicios"
      DROP COLUMN IF EXISTS "habitacion";
    `);
  }
}
