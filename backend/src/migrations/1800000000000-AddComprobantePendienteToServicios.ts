import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega `comprobante_pendiente` a la tabla `servicios`.
 *
 * Hasta ahora, una reserva pagada por transferencia no existia como servicio
 * hasta que el cliente mandaba la foto del comprobante: `finalizeBooking` --el
 * unico sitio que da de alta el servicio y avisa al jefe-- se llamaba despues
 * de validarla. Como el cliente tipico responde "cuando llegues transfiero",
 * la reserva se quedaba en un limbo del que nadie se enteraba: ni el jefe la
 * veia, ni quedaba rastro de que hubiera existido.
 *
 * Ahora el servicio nace en cuanto estan las horas, el pago y la ubicacion, y
 * esta bandera marca que todavia falta el comprobante. El pago deja de ser una
 * condicion para que el servicio exista y pasa a ser una condicion para
 * despacharlo, que es una decision del jefe y no del silencio.
 */
export class AddComprobantePendienteToServicios1800000000000
  implements MigrationInterface
{
  name = 'AddComprobantePendienteToServicios1800000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "servicios"
      ADD COLUMN IF NOT EXISTS "comprobante_pendiente" boolean NOT NULL DEFAULT false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "servicios"
      DROP COLUMN IF EXISTS "comprobante_pendiente";
    `);
  }
}
