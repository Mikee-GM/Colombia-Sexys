import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Politica de besos declarada, en vez de deducida del texto libre.
 *
 * Hasta ahora la respuesta de la modelo sobre los besos se adivinaba leyendo su
 * descripcion con expresiones regulares. Eso significa que editar la biografia
 * —cambiar una palabra, reescribir una frase— podia invertir en silencio lo que
 * la IA le promete al cliente, sin que nadie lo notara hasta la queja.
 *
 * La columna es opcional a proposito: mientras este vacia se sigue usando la
 * deteccion sobre la descripcion, asi que ninguna ficha existente cambia de
 * comportamiento al aplicar esta migracion.
 */
export class AddEmployeeKissingPolicy1792500000000 implements MigrationInterface {
  name = 'AddEmployeeKissingPolicy1792500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.empleadas
         ADD COLUMN IF NOT EXISTS "politica_besos" character varying(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE public.empleadas
         DROP CONSTRAINT IF EXISTS "CHK_empleadas_politica_besos"`,
    );
    await queryRunner.query(
      `ALTER TABLE public.empleadas
         ADD CONSTRAINT "CHK_empleadas_politica_besos"
         CHECK ("politica_besos" IS NULL OR "politica_besos" IN ('no_besa', 'besos', 'besos_bien_dados'))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.empleadas
         DROP CONSTRAINT IF EXISTS "CHK_empleadas_politica_besos"`,
    );
    await queryRunner.query(
      `ALTER TABLE public.empleadas DROP COLUMN IF EXISTS "politica_besos"`,
    );
  }
}
