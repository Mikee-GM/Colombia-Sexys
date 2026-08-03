import { MigrationInterface, QueryRunner } from 'typeorm';

export class StoreEvidenceInR21785600000000 implements MigrationInterface {
  name = 'StoreEvidenceInR21785600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "viajes" ADD "uber_screenshot_url" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "viajes" ADD "uber_screenshot_uploaded_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_receipt_validations" ADD "image_url" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_receipt_validations" ADD "telegram_file_id" character varying(255)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_payment_receipt_validations_servicio_created" ON "payment_receipt_validations" ("servicio_id", "created_at" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_payment_receipt_validations_created" ON "payment_receipt_validations" ("created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."idx_payment_receipt_validations_created"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_payment_receipt_validations_servicio_created"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_receipt_validations" DROP COLUMN "telegram_file_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_receipt_validations" DROP COLUMN "image_url"`,
    );
    await queryRunner.query(
      `ALTER TABLE "viajes" DROP COLUMN "uber_screenshot_uploaded_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "viajes" DROP COLUMN "uber_screenshot_url"`,
    );
  }
}
