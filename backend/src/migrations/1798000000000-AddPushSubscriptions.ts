import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Destinos de aviso push de cada usuario.
 *
 * Una suscripcion es por navegador y por dispositivo, no por persona: el mismo
 * jefe tiene una fila para el movil y otra para el portatil, y el aviso hay que
 * mandarlo a todas. Por eso la clave natural es el `endpoint` que devuelve el
 * navegador y no el usuario: al volver a suscribirse en el mismo dispositivo
 * llega el mismo endpoint, y eso es una actualizacion, no un destino nuevo.
 *
 * `fallos` no sirve para reintentar --el servicio de push ya reintenta por su
 * cuenta-- sino para poder mirar por que un telefono concreto dejo de recibir
 * sin que nadie se diera cuenta.
 */
export class AddPushSubscriptions1798000000000 implements MigrationInterface {
  name = 'AddPushSubscriptions1798000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS public.push_subscriptions (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
         endpoint text NOT NULL UNIQUE,
         p256dh text NOT NULL,
         auth text NOT NULL,
         user_agent text,
         creada_en timestamp with time zone NOT NULL DEFAULT now(),
         ultimo_envio timestamp with time zone,
         fallos smallint NOT NULL DEFAULT 0
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_push_subscriptions_usuario
         ON public.push_subscriptions (usuario_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS public.idx_push_subscriptions_usuario`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS public.push_subscriptions`);
  }
}
