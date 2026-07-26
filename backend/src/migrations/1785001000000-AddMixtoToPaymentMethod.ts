import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMixtoToPaymentMethod1785001000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "public"."servicios_metodo_pago_enum" ADD VALUE IF NOT EXISTS 'mixto'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: PostgreSQL does not support removing values from an ENUM type easily.
    // We would have to recreate the ENUM type without the 'mixto' value.
  }
}
