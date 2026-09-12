import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Canal de mensajes entre una modelo y sus jefes.
 *
 * Hasta ahora las dudas se resolvian por el chat del servicio, que solo existe
 * mientras hay un servicio, o por el grupo, donde escribe todo el mundo. Este
 * canal es de la modelo con quien la coordina y vive siempre.
 *
 * El anonimato es la razon de que el autor se guarde en `autor_user_id` y no se
 * pinte nunca del lado de ella: el jefe sabe con quien habla, ella habla con
 * "coordinacion". Guardar el autor sigue haciendo falta para que el panel del
 * jefe sepa quien contesto y para poder auditar la conversacion.
 *
 * `motivo_jornada` se guarda en el usuario y no aqui porque es un dato del
 * estado actual de la persona --por que cerro su dia hoy-- y se consulta junto
 * al resto de su jornada; el intercambio de preguntas y respuestas que lleva a
 * el si vive en este canal, marcado con tipo 'jornada'.
 */
export class CreateTeamChannel1793200000000 implements MigrationInterface {
  name = 'CreateTeamChannel1793200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS public.mensajes_equipo (
         "id" uuid NOT NULL DEFAULT gen_random_uuid(),
         "empleada_id" uuid NOT NULL,
         "emisor" character varying(10) NOT NULL,
         "autor_user_id" uuid,
         "cuerpo" text NOT NULL,
         "tipo" character varying(20) NOT NULL DEFAULT 'duda',
         "leido_at" timestamp with time zone,
         "created_at" timestamp with time zone NOT NULL DEFAULT now(),
         CONSTRAINT "mensajes_equipo_pkey" PRIMARY KEY ("id"),
         CONSTRAINT "mensajes_equipo_emisor_check"
           CHECK ("emisor" IN ('empleada', 'jefe')),
         CONSTRAINT "mensajes_equipo_empleada_fkey"
           FOREIGN KEY ("empleada_id") REFERENCES public.empleadas ("id")
           ON DELETE CASCADE,
         CONSTRAINT "mensajes_equipo_autor_fkey"
           FOREIGN KEY ("autor_user_id") REFERENCES public.usuarios ("id")
           ON DELETE SET NULL
       )`,
    );

    // La conversacion siempre se lee entera y en orden, por empleada.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_mensajes_equipo_empleada"
         ON public.mensajes_equipo ("empleada_id", "created_at" DESC)`,
    );

    // El panel del jefe pinta cuantos hay sin leer de cada modelo.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_mensajes_equipo_sin_leer"
         ON public.mensajes_equipo ("empleada_id")
         WHERE "leido_at" IS NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE public.usuarios
         ADD COLUMN IF NOT EXISTS "jornada_motivo" text,
         ADD COLUMN IF NOT EXISTS "jornada_motivo_at" timestamp with time zone`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.usuarios
         DROP COLUMN IF EXISTS "jornada_motivo_at",
         DROP COLUMN IF EXISTS "jornada_motivo"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS public."idx_mensajes_equipo_sin_leer"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS public."idx_mensajes_equipo_empleada"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS public.mensajes_equipo`);
  }
}
