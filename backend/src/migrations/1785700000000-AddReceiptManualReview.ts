import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReceiptManualReview1785700000000 implements MigrationInterface {
  name = 'AddReceiptManualReview1785700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_receipt_validations"
        ADD "jefe_id" uuid,
        ADD "revisado_por_user_id" uuid,
        ADD "revisado_at" TIMESTAMP WITH TIME ZONE,
        ADD "draft_payload" jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_receipt_validations"
        ADD CONSTRAINT "FK_payment_receipt_validations_jefe_id" FOREIGN KEY ("jefe_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
        ADD CONSTRAINT "FK_payment_receipt_validations_revisado_por_user_id" FOREIGN KEY ("revisado_por_user_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_receipt_validations"
        DROP CONSTRAINT "FK_payment_receipt_validations_revisado_por_user_id",
        DROP CONSTRAINT "FK_payment_receipt_validations_jefe_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "payment_receipt_validations"
        DROP COLUMN "draft_payload",
        DROP COLUMN "revisado_at",
        DROP COLUMN "revisado_por_user_id",
        DROP COLUMN "jefe_id"
    `);
  }
}
