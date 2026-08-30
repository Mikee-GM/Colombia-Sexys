import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marca el extra comodin del catalogo de cada empleada.
 *
 * Cuando la modelo cobra un extra por un monto libre desde el chat, hace falta
 * una fila del catalogo a la que colgar el cobro, asi que se crea una llamada
 * "Extra" con el primer importe que cobro. Esa fila se quedaba en su catalogo
 * como una mas: aparecia en el portal ofreciendole "Extra" a un precio fijo que
 * no significaba nada --el del primer monto libre que cobro en su vida-- y
 * ensuciaba la vista del catalogo en el panel.
 *
 * No basta con desactivarla: `addServiceExtra` rechaza los extras inactivos, y
 * la fila tiene que seguir sirviendo de ancla. Por eso una columna propia, que
 * dice lo que la fila es en vez de si esta disponible.
 *
 * Se marcan las que ya existen por el mismo criterio con el que el codigo las
 * busca hoy: el nombre exacto "Extra". Si alguna empleada creo a mano un extra
 * con ese nombre, deja de verlo en su menu; sigue en la base y sus cobros
 * pasados no se tocan.
 */
export class AddEsGenericoToExtrasCatalogo1797000000000 implements MigrationInterface {
  name = 'AddEsGenericoToExtrasCatalogo1797000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "extras_catalogo"
      ADD COLUMN IF NOT EXISTS "es_generico" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      UPDATE "extras_catalogo"
      SET "es_generico" = true
      WHERE "nombre" = 'Extra' AND "es_generico" = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "extras_catalogo" DROP COLUMN IF EXISTS "es_generico"
    `);
  }
}
