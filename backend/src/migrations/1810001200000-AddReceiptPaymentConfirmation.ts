import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReceiptPaymentConfirmation1810001200000 implements MigrationInterface {
  name = 'AddReceiptPaymentConfirmation1810001200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payment_receipt_validations"
        ADD COLUMN IF NOT EXISTS "monto_esperado" numeric(10, 2),
        ADD COLUMN IF NOT EXISTS "tipo_cobro" varchar(20),
        ADD COLUMN IF NOT EXISTS "pago_confirmado_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "pago_confirmado_por_user_id" uuid,
        ADD COLUMN IF NOT EXISTS "pago_confirmacion_fuente" varchar(20)
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_receipt_confirmed_spei_key"
        ON "payment_receipt_validations" (UPPER("id_spei"))
       WHERE "pago_confirmado_at" IS NOT NULL AND "id_spei" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_receipt_confirmed_spei_key"`,
    );
    await queryRunner.query(`
      ALTER TABLE "payment_receipt_validations"
        DROP COLUMN IF EXISTS "pago_confirmacion_fuente",
        DROP COLUMN IF EXISTS "pago_confirmado_por_user_id",
        DROP COLUMN IF EXISTS "pago_confirmado_at",
        DROP COLUMN IF EXISTS "monto_esperado",
        DROP COLUMN IF EXISTS "tipo_cobro"
    `);
  }
}
