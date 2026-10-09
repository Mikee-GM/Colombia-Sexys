import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Completa la infraestructura push existente sin reemplazar suscripciones.
 *
 * Todas las columnas son aditivas y reciben valores conservadores para las
 * filas que ya existen en produccion. El registro de eventos guarda solo
 * metadatos de entrega y claves de deduplicacion, nunca el texto del aviso.
 */
export class ImprovePwaPushReliability1810000700000 implements MigrationInterface {
  name = 'ImprovePwaPushReliability1810000700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.push_subscriptions
         ADD COLUMN IF NOT EXISTS actualizada_en timestamp with time zone NOT NULL DEFAULT now(),
         ADD COLUMN IF NOT EXISTS ultima_vista_en timestamp with time zone NOT NULL DEFAULT now(),
         ADD COLUMN IF NOT EXISTS habilitada boolean NOT NULL DEFAULT true,
         ADD COLUMN IF NOT EXISTS ultimo_fallo_en timestamp with time zone`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS public.push_notification_events (
         id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
         event_id uuid NOT NULL,
         usuario_id uuid NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
         type character varying(100) NOT NULL,
         related_entity_id uuid,
         dedupe_key character varying(300) NOT NULL,
         created_at timestamp with time zone NOT NULL DEFAULT now(),
         sent_at timestamp with time zone,
         status character varying(20) NOT NULL DEFAULT 'pending',
         delivered_count integer NOT NULL DEFAULT 0,
         CONSTRAINT ck_push_notification_events_status
           CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
         CONSTRAINT uq_push_notification_events_user_dedupe
           UNIQUE (usuario_id, dedupe_key)
       )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_push_notification_events_user
         ON public.push_notification_events (usuario_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_push_notification_events_created
         ON public.push_notification_events (created_at)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS public.idx_push_notification_events_created`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS public.idx_push_notification_events_user`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS public.push_notification_events`,
    );
    await queryRunner.query(
      `ALTER TABLE public.push_subscriptions
         DROP COLUMN IF EXISTS ultimo_fallo_en,
         DROP COLUMN IF EXISTS habilitada,
         DROP COLUMN IF EXISTS ultima_vista_en,
         DROP COLUMN IF EXISTS actualizada_en`,
    );
  }
}
