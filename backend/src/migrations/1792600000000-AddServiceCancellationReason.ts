import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Motivo, autor y momento de una cancelacion.
 *
 * Hasta ahora cancelar un servicio solo escribia `estado = 'cancelado'`. Con eso
 * "el cliente se arrepintio" y "la modelo no llego" quedan guardados igual, y
 * ninguna consecuencia posterior —penalizacion al cliente, confiabilidad de la
 * modelo, gasto de transporte que igual hubo que pagar— se puede decidir sobre
 * un dato que no existe.
 *
 * Las columnas son opcionales porque los servicios cancelados antes de esta
 * migracion no tienen forma de recuperar su motivo: se quedan en NULL y las
 * vistas los muestran como "sin registrar" en vez de inventarles una causa.
 */
export class AddServiceCancellationReason1792600000000
  implements MigrationInterface
{
  name = 'AddServiceCancellationReason1792600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.servicios
         ADD COLUMN IF NOT EXISTS "motivo_cancelacion" character varying(40),
         ADD COLUMN IF NOT EXISTS "nota_cancelacion" text,
         ADD COLUMN IF NOT EXISTS "cancelado_por_user_id" uuid,
         ADD COLUMN IF NOT EXISTS "cancelado_at" timestamp with time zone`,
    );

    await queryRunner.query(
      `ALTER TABLE public.servicios
         DROP CONSTRAINT IF EXISTS "CHK_servicios_motivo_cancelacion"`,
    );
    await queryRunner.query(
      `ALTER TABLE public.servicios
         ADD CONSTRAINT "CHK_servicios_motivo_cancelacion"
         CHECK ("motivo_cancelacion" IS NULL OR "motivo_cancelacion" IN (
           'cliente_desistio',
           'cliente_no_responde',
           'modelo_no_disponible',
           'modelo_tardanza',
           'sin_transporte',
           'problema_pago',
           'seguridad',
           'error_operativo',
           'rechazado_por_jefe',
           'otro'
         ))`,
    );

    // Se borra el autor, no la cancelacion: el motivo debe sobrevivir aunque el
    // usuario que cancelo se elimine del sistema.
    await queryRunner.query(
      `ALTER TABLE public.servicios
         DROP CONSTRAINT IF EXISTS "FK_servicios_cancelado_por_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE public.servicios
         ADD CONSTRAINT "FK_servicios_cancelado_por_user"
         FOREIGN KEY ("cancelado_por_user_id") REFERENCES public.usuarios("id")
         ON DELETE SET NULL`,
    );

    // Los tableros filtran cancelados por motivo y por fecha de cancelacion.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_servicios_motivo_cancelacion"
         ON public.servicios ("motivo_cancelacion", "cancelado_at")
         WHERE "motivo_cancelacion" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS public."idx_servicios_motivo_cancelacion"`,
    );
    await queryRunner.query(
      `ALTER TABLE public.servicios
         DROP CONSTRAINT IF EXISTS "FK_servicios_cancelado_por_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE public.servicios
         DROP CONSTRAINT IF EXISTS "CHK_servicios_motivo_cancelacion"`,
    );
    await queryRunner.query(
      `ALTER TABLE public.servicios
         DROP COLUMN IF EXISTS "cancelado_at",
         DROP COLUMN IF EXISTS "cancelado_por_user_id",
         DROP COLUMN IF EXISTS "nota_cancelacion",
         DROP COLUMN IF EXISTS "motivo_cancelacion"`,
    );
  }
}
