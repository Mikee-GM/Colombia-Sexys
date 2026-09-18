import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega la columna modo_bot a empleadas y choferes.
 *
 * true  = la persona usa el app de Telegram normalmente (comportamiento previo).
 * false = el sistema avanza automaticamente sin esperar su interaccion: util
 *         durante la fase de simulacion en produccion donde no todos los usuarios
 *         han sido incorporados al nuevo flujo.
 *
 * El default es true para que los registros existentes no cambien de comportamiento.
 */
export class AddModoBot1804000000000 implements MigrationInterface {
  name = 'AddModoBot1804000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "empleadas"
      ADD COLUMN IF NOT EXISTS "modo_bot" boolean NOT NULL DEFAULT true
    `);

    await queryRunner.query(`
      ALTER TABLE "choferes"
      ADD COLUMN IF NOT EXISTS "modo_bot" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "choferes" DROP COLUMN IF EXISTS "modo_bot"`,
    );
    await queryRunner.query(
      `ALTER TABLE "empleadas" DROP COLUMN IF EXISTS "modo_bot"`,
    );
  }
}
