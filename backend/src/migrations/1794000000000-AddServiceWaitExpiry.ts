import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Plazo de espera de la empleada, respaldado en base.
 *
 * Antes solo vivia en un setTimeout de Node: un despliegue a mitad de la
 * espera lo perdia sin cancelar el servicio por demora, y con mas de una
 * replica corriendo, el temporizador solo existia en la que atendio el boton
 * original. Con la fecha de vencimiento en la fila, un ciclo periodico puede
 * detectar los que ya vencieron sin depender de que el proceso que los inicio
 * siga vivo.
 */
export class AddServiceWaitExpiry1794000000000 implements MigrationInterface {
  name = 'AddServiceWaitExpiry1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "servicios"
         ADD COLUMN IF NOT EXISTS "espera_expira_at" timestamp with time zone`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "servicios"
         DROP COLUMN IF EXISTS "espera_expira_at"`,
    );
  }
}
