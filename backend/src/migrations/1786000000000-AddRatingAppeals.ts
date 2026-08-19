import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRatingAppeals1786000000000 implements MigrationInterface {
  name = 'AddRatingAppeals1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "interaction_ratings"
        ADD COLUMN IF NOT EXISTS "appeal_status" character varying(20) NOT NULL DEFAULT 'none',
        ADD COLUMN IF NOT EXISTS "appeal_reason" text,
        ADD COLUMN IF NOT EXISTS "appeal_resolved_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "appeal_resolved_by_user_id" uuid;
      CREATE INDEX IF NOT EXISTS "idx_interaction_ratings_appeal_status" ON "interaction_ratings" ("appeal_status");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "interaction_ratings"
        DROP COLUMN IF EXISTS "appeal_status",
        DROP COLUMN IF EXISTS "appeal_reason",
        DROP COLUMN IF EXISTS "appeal_resolved_at",
        DROP COLUMN IF EXISTS "appeal_resolved_by_user_id";
    `);
  }
}
