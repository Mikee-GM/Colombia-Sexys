import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowNullableServiceLocation1810000600000 implements MigrationInterface {
  name = 'AllowNullableServiceLocation1810000600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "servicios" ALTER COLUMN "ubicacion_cliente_lat" DROP NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "servicios" ALTER COLUMN "ubicacion_cliente_lng" DROP NOT NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "servicios" ALTER COLUMN "ubicacion_cliente_lat" SET NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "servicios" ALTER COLUMN "ubicacion_cliente_lng" SET NOT NULL',
    );
  }
}
