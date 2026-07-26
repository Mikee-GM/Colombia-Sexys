import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAiLimitsToClients1783200000000 implements MigrationInterface {
  name = 'AddAiLimitsToClients1783200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clientes" 
      ADD COLUMN "ai_calls_today" integer NOT NULL DEFAULT 0,
      ADD COLUMN "last_ai_call_at" timestamp with time zone;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clientes" 
      DROP COLUMN "last_ai_call_at",
      DROP COLUMN "ai_calls_today";
    `);
  }
}
