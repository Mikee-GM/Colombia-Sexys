import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Deja rastro de las dos correcciones manuales que faltaban.
 *
 * Reasignar la modelo de un servicio y el chofer de un viaje no existia por
 * ninguna via: la unica salida era cancelar y volver a crear, lo que pierde la
 * conversacion con el cliente, el historico y cualquier anticipo ya registrado.
 * Un cambio de ultimo momento --se enferma media hora antes, con el cliente ya
 * habiendo pagado-- obligaba a devolver y volver a cobrar.
 *
 * Estas columnas guardan de quien venia y por que se movio. Sin ellas, un
 * servicio reasignado seria indistinguible de uno que siempre fue de esa
 * modelo, y el reparto del dinero de la semana se decide mirando justamente
 * eso: quien lo hizo.
 *
 * Se sigue el patron de la cancelacion y del cierre por la oficina --autor,
 * momento y motivo-- para que las tres correcciones se lean igual.
 */
export class AddManualCorrections1799000000000 implements MigrationInterface {
  name = 'AddManualCorrections1799000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "servicios"
      ADD COLUMN IF NOT EXISTS "empleada_anterior_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "servicios"
      ADD COLUMN IF NOT EXISTS "reasignado_por_user_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "servicios"
      ADD COLUMN IF NOT EXISTS "reasignado_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "servicios"
      ADD COLUMN IF NOT EXISTS "motivo_reasignacion" text
    `);

    await queryRunner.query(`
      ALTER TABLE "viajes"
      ADD COLUMN IF NOT EXISTS "chofer_anterior_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "viajes"
      ADD COLUMN IF NOT EXISTS "corregido_por_user_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "viajes"
      ADD COLUMN IF NOT EXISTS "corregido_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "viajes"
      ADD COLUMN IF NOT EXISTS "motivo_correccion" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const columna of [
      'motivo_correccion',
      'corregido_at',
      'corregido_por_user_id',
      'chofer_anterior_id',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "viajes" DROP COLUMN IF EXISTS "${columna}"`,
      );
    }
    for (const columna of [
      'motivo_reasignacion',
      'reasignado_at',
      'reasignado_por_user_id',
      'empleada_anterior_id',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "servicios" DROP COLUMN IF EXISTS "${columna}"`,
      );
    }
  }
}
