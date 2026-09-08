import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Area de cobertura del servicio.
 *
 * Hasta aqui el bot aceptaba cualquier pin del mundo: le aplicaba la tarifa
 * plana de ubicacion externa y seguia pidiendo el metodo de pago, asi que un
 * cliente a seiscientos kilometros llegaba al final del embudo y el servicio
 * nacia igual. El unico calculo de distancia que existia era el radio de 150 m
 * con el que se reconoce si el pin cae sobre un motel propio.
 *
 * Los valores por defecto son la ciudad de Queretaro con 45 km a la redonda:
 * cubren toda la zona metropolitana --Corregidora, El Marques, Juriquilla-- sin
 * salirse del estado. Quedan fuera San Juan del Rio y Tequisquiapan, que estan
 * a mas de 50 km; si algun dia se atienden, se sube el radio en esta misma
 * tabla y no hace falta desplegar.
 */
export class AddServiceCoverageArea1802000000000 implements MigrationInterface {
  name = 'AddServiceCoverageArea1802000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transport_settings"
        ADD COLUMN IF NOT EXISTS "coverage_city" varchar(80) NOT NULL DEFAULT 'Querétaro',
        ADD COLUMN IF NOT EXISTS "coverage_center_lat" numeric(10,7) NOT NULL DEFAULT 20.5888,
        ADD COLUMN IF NOT EXISTS "coverage_center_lng" numeric(10,7) NOT NULL DEFAULT -100.3899,
        ADD COLUMN IF NOT EXISTS "coverage_radius_km" numeric(6,2) NOT NULL DEFAULT 45;
    `);

    await queryRunner.query(`
      ALTER TABLE "transport_settings"
        DROP CONSTRAINT IF EXISTS "chk_transport_settings_coverage_radius";
      ALTER TABLE "transport_settings"
        ADD CONSTRAINT "chk_transport_settings_coverage_radius"
        CHECK ("coverage_radius_km" > 0 AND "coverage_radius_km" <= 500);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "transport_settings"
        DROP CONSTRAINT IF EXISTS "chk_transport_settings_coverage_radius";
      ALTER TABLE "transport_settings"
        DROP COLUMN IF EXISTS "coverage_city",
        DROP COLUMN IF EXISTS "coverage_center_lat",
        DROP COLUMN IF EXISTS "coverage_center_lng",
        DROP COLUMN IF EXISTS "coverage_radius_km";
    `);
  }
}
