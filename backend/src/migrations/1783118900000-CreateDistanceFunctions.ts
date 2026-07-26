import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDistanceFunctions1783118900000 implements MigrationInterface {
  name = 'CreateDistanceFunctions1783118900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION calcular_distancia_haversine(
          lat1 double precision,
          lng1 double precision,
          lat2 double precision,
          lng2 double precision
      )
      RETURNS double precision AS $$
      DECLARE
          r double precision := 6371.0; -- Radio de la tierra en km
          dlat double precision;
          dlng double precision;
          a double precision;
          c double precision;
      BEGIN
          IF lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN
              RETURN NULL;
          END IF;

          dlat := radians(lat2 - lat1);
          dlng := radians(lng2 - lng1);

          a := sin(dlat / 2.0)^2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2.0)^2;
          c := 2.0 * asin(sqrt(a));

          RETURN r * c;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS calcular_distancia_haversine(double precision, double precision, double precision, double precision);
    `);
  }
}
