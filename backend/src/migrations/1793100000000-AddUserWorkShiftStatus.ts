import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Estado de jornada: si la persona sigue trabajando hoy.
 *
 * Hasta ahora solo existia `disponible`, que responde a otra pregunta: si puede
 * tomar algo en este momento. Una modelo en servicio y una que ya cerro su dia
 * quedaban igual de "no disponibles", asi que nadie podia distinguir un hueco
 * de una hora de un "ya no cuenten conmigo".
 *
 * Nace en `true` para que nada cambie al aplicar la migracion: todo el mundo se
 * considera dentro de su jornada hasta que pulse el boton.
 */
export class AddUserWorkShiftStatus1793100000000 implements MigrationInterface {
  name = 'AddUserWorkShiftStatus1793100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.usuarios
         ADD COLUMN IF NOT EXISTS "en_jornada" boolean NOT NULL DEFAULT true,
         ADD COLUMN IF NOT EXISTS "jornada_actualizada_at" timestamp with time zone`,
    );

    // El panel de admin lista justo a quien esta fuera de jornada.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_usuarios_fuera_de_jornada"
         ON public.usuarios ("rol", "jornada_actualizada_at")
         WHERE "en_jornada" = false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS public."idx_usuarios_fuera_de_jornada"`,
    );
    await queryRunner.query(
      `ALTER TABLE public.usuarios
         DROP COLUMN IF EXISTS "jornada_actualizada_at",
         DROP COLUMN IF EXISTS "en_jornada"`,
    );
  }
}
