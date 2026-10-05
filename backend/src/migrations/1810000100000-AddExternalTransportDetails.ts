import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddExternalTransportDetails1810000100000 implements MigrationInterface {
  name = 'AddExternalTransportDetails1810000100000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "viajes" ADD COLUMN IF NOT EXISTS "external_platform" varchar(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE "viajes" ADD COLUMN IF NOT EXISTS "external_shared_link" text`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "viajes" DROP COLUMN IF EXISTS "external_shared_link"`,
    );
    await queryRunner.query(
      `ALTER TABLE "viajes" DROP COLUMN IF EXISTS "external_platform"`,
    );
  }
}
