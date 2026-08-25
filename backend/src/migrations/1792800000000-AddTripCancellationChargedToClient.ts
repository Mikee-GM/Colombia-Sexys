import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Quien asume el costo de un viaje cancelado.
 *
 * Al cerrar el costo de un Uber que ya se habia pedido, el gasto se daba
 * siempre por absorbido por la casa. En la practica no hay una regla fija: si
 * el cliente cancelo tarde y el carro ya iba en camino, ese traslado se le
 * cobra; si la cancelacion fue por un error de la oficina, no. La decision se
 * toma caso por caso al cerrar el viaje, asi que tiene que guardarse por viaje.
 */
export class AddTripCancellationChargedToClient1792800000000
  implements MigrationInterface
{
  name = 'AddTripCancellationChargedToClient1792800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.viajes
         ADD COLUMN IF NOT EXISTS "costo_cobrado_al_cliente" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.viajes
         DROP COLUMN IF EXISTS "costo_cobrado_al_cliente"`,
    );
  }
}
