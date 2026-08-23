import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Buzon para repartir los eventos en vivo entre replicas.
 *
 * Los canales SSE viven en la memoria de cada proceso, asi que con mas de una
 * replica el jefe conectado a una no recibia nunca lo que emitia la otra: la
 * notificacion desaparecia sin error, sin registro y sin reintento.
 *
 * El aviso viaja por `NOTIFY`, que esta limitado a 8 KB de carga util; el
 * contenido del evento, que puede ser un servicio entero con sus relaciones,
 * viaja por esta tabla. Un barrido periodico borra lo ya entregado.
 */
export class AddRealtimeOutbox1792400000000 implements MigrationInterface {
  name = 'AddRealtimeOutbox1792400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS public.realtime_outbox (
         id bigserial PRIMARY KEY,
         payload jsonb NOT NULL,
         created_at timestamp with time zone NOT NULL DEFAULT now()
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_realtime_outbox_created_at
         ON public.realtime_outbox (created_at)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS public.idx_realtime_outbox_created_at`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS public.realtime_outbox`);
  }
}
