import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Costo pendiente de un viaje cancelado despues de despacharse.
 *
 * Cuando un servicio se cancela, sus viajes pasan a `cancelado` y ahi terminaba
 * todo. Pero un Uber que ya se habia pedido si se pago, y ese gasto no llegaba
 * a ningun corte: el servicio nunca se finaliza, asi que la sincronizacion de
 * liquidaciones ni siquiera corria. En la ficha quedaba el cobro de transporte
 * al cliente contra un costo de cero, es decir, un margen que no existio.
 *
 * Esta bandera marca los viajes que pudieron costar dinero para que la oficina
 * cierre el costo a mano: confirmar la tarifa real o declarar que no salio.
 * Adivinarlo seria peor que preguntarlo.
 */
export class AddTripCancelledWithCost1792700000000
  implements MigrationInterface
{
  name = 'AddTripCancelledWithCost1792700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.viajes
         ADD COLUMN IF NOT EXISTS "cancelado_con_costo" boolean NOT NULL DEFAULT false`,
    );

    // Los viajes ya cancelados de antes no se marcan: nadie puede reconstruir
    // hoy si aquel Uber salio o no, y marcarlos llenaria la bandeja de
    // pendientes imposibles de cerrar con certeza.

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_viajes_cancelado_con_costo"
         ON public.viajes ("cancelado_con_costo")
         WHERE "cancelado_con_costo" = true AND "fare_confirmed_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS public."idx_viajes_cancelado_con_costo"`,
    );
    await queryRunner.query(
      `ALTER TABLE public.viajes DROP COLUMN IF EXISTS "cancelado_con_costo"`,
    );
  }
}
