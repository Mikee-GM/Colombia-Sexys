import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Deja constancia de un servicio que cerro la oficina y no la modelo.
 *
 * Cerrar un servicio era exclusivo de la modelo. Si se le moria el telefono, se
 * quedaba sin cobertura o simplemente se le olvidaba, el servicio se quedaba en
 * curso indefinidamente: ella seguia marcada como no disponible, no se pedia el
 * transporte de regreso, no entraba en la liquidacion y no se pedian las
 * calificaciones. La unica salida era editar la fila a mano, que la dejaba
 * marcada como cerrada sin nada de lo demas.
 *
 * Con estas tres columnas el cierre por la oficina pasa por el mismo camino que
 * el suyo y ademas queda distinguible del normal. Sin ellas, dentro de una
 * semana un servicio cerrado por un jefe seria indistinguible de uno que cerro
 * ella, y el reparto del dinero se decide mirando justamente eso.
 *
 * Se sigue el mismo patron que ya usa la cancelacion --autor, momento y
 * motivo-- para que las dos correcciones se lean igual.
 */
export class AddServiceOfficeClose1798000000000 implements MigrationInterface {
  name = 'AddServiceOfficeClose1798000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "servicios"
      ADD COLUMN IF NOT EXISTS "cerrado_por_oficina_user_id" uuid
    `);
    await queryRunner.query(`
      ALTER TABLE "servicios"
      ADD COLUMN IF NOT EXISTS "cerrado_por_oficina_at" TIMESTAMP WITH TIME ZONE
    `);
    await queryRunner.query(`
      ALTER TABLE "servicios"
      ADD COLUMN IF NOT EXISTS "motivo_cierre_oficina" text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "servicios" DROP COLUMN IF EXISTS "motivo_cierre_oficina"
    `);
    await queryRunner.query(`
      ALTER TABLE "servicios" DROP COLUMN IF EXISTS "cerrado_por_oficina_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "servicios" DROP COLUMN IF EXISTS "cerrado_por_oficina_user_id"
    `);
  }
}
