import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Preferencias de interfaz por usuario.
 *
 * La primera es la disposicion del centro de mando --que bloques ve cada
 * administrador y en que orden-- pero la tabla se deja generica a proposito: es
 * el mismo problema para cualquier ajuste de pantalla que deba sobrevivir al
 * cierre de sesion.
 *
 * No va en `localStorage` porque se pidio explicitamente que la disposicion
 * siguiera al usuario y no al navegador: quien la ordena en la oficina se la
 * encuentra igual desde su casa.
 *
 * El valor es `jsonb` sin esquema fijo: cada clave decide su forma, y validarla
 * en la base obligaria a migrar cada vez que una pantalla gana una opcion.
 */
export class CreateUserPreferences1793400000000 implements MigrationInterface {
  name = 'CreateUserPreferences1793400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_preferences" (
        "user_id" uuid NOT NULL,
        "key" varchar(60) NOT NULL,
        "value" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_preferences" PRIMARY KEY ("user_id", "key"),
        CONSTRAINT "FK_user_preferences_user" FOREIGN KEY ("user_id")
          REFERENCES "usuarios"("id") ON DELETE CASCADE
      );
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_preferences";`);
  }
}
