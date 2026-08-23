import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Persiste el vencimiento de la oferta de viaje al chofer.
 *
 * Hasta ahora la expiracion era un setTimeout guardado en un Map de instancia:
 * en cada despliegue o reinicio los temporizadores pendientes desaparecian sin
 * dejar rastro y el viaje se quedaba en 'notificado' para siempre. Con la fecha
 * en base de datos, el ciclo de mantenimiento puede barrer las ofertas vencidas
 * aunque el proceso que las creo ya no exista.
 */
export class AddDispatchOfferExpiry1792000000000 implements MigrationInterface {
  name = 'AddDispatchOfferExpiry1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.viajes ADD COLUMN IF NOT EXISTS oferta_expira_en timestamp with time zone`,
    );
    // Indice parcial: solo interesan las ofertas todavia vivas, que son unas
    // pocas filas frente al historico completo de viajes.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_viajes_oferta_expira_en
         ON public.viajes (oferta_expira_en)
         WHERE oferta_expira_en IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS public.idx_viajes_oferta_expira_en`,
    );
    await queryRunner.query(
      `ALTER TABLE public.viajes DROP COLUMN IF EXISTS oferta_expira_en`,
    );
  }
}
