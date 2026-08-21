import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmployeeTelegramBots1791000000000 implements MigrationInterface {
  name = 'CreateEmployeeTelegramBots1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_telegram_bots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "employee_id" uuid NOT NULL,
        "token_ciphertext" text NOT NULL,
        "token_hint" character varying(8) NOT NULL,
        "bot_id" bigint,
        "bot_username" character varying(64),
        "status" character varying(20) NOT NULL DEFAULT 'pendiente',
        "last_error" text,
        "webhook_secret" character varying(64) NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "employee_telegram_bots_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_employee_telegram_bots_employee" FOREIGN KEY ("employee_id") REFERENCES "empleadas"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      );
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_employee_telegram_bots_employee" ON "employee_telegram_bots" ("employee_id");
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_employee_telegram_bots_bot_id" ON "employee_telegram_bots" ("bot_id") WHERE "bot_id" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "employee_telegram_bots" CASCADE`,
    );
  }
}
