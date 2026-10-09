import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTelegramMessageDeletionLifecycle1810000800000 implements MigrationInterface {
  name = 'AddTelegramMessageDeletionLifecycle1810000800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversaciones_telegram"
        ADD COLUMN "telegram_message_id" bigint,
        ADD COLUMN "telegram_chat_id" varchar(64),
        ADD COLUMN "delete_at" timestamptz,
        ADD COLUMN "delete_status" varchar(24),
        ADD COLUMN "delete_attempts" integer NOT NULL DEFAULT 0,
        ADD COLUMN "last_delete_error" text,
        ADD COLUMN "deleted_from_telegram_at" timestamptz,
        ADD CONSTRAINT "CHK_conversaciones_telegram_delete_status"
          CHECK (
            "delete_status" IS NULL OR
            "delete_status" IN (
              'PENDING',
              'DELETED',
              'FAILED_RETRYABLE',
              'EXPIRED',
              'NOT_DELETABLE'
            )
          )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_conversaciones_telegram_delete_due"
        ON "conversaciones_telegram" ("delete_status", "delete_at")
        WHERE "delete_status" IN ('PENDING', 'FAILED_RETRYABLE')
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_conversaciones_telegram_message"
        ON "conversaciones_telegram" ("telegram_chat_id", "telegram_message_id")
        WHERE "telegram_message_id" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_conversaciones_telegram_message"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_conversaciones_telegram_delete_due"`,
    );
    await queryRunner.query(`
      ALTER TABLE "conversaciones_telegram"
        DROP CONSTRAINT IF EXISTS "CHK_conversaciones_telegram_delete_status",
        DROP COLUMN IF EXISTS "deleted_from_telegram_at",
        DROP COLUMN IF EXISTS "last_delete_error",
        DROP COLUMN IF EXISTS "delete_attempts",
        DROP COLUMN IF EXISTS "delete_status",
        DROP COLUMN IF EXISTS "delete_at",
        DROP COLUMN IF EXISTS "telegram_chat_id",
        DROP COLUMN IF EXISTS "telegram_message_id"
    `);
  }
}
