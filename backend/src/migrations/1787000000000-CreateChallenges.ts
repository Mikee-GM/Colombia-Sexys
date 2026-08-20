import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChallenges1787000000000 implements MigrationInterface {
  name = 'CreateChallenges1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "challenges" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" character varying(160) NOT NULL,
        "participant_type" character varying(20) NOT NULL,
        "metric" character varying(20) NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'scheduled',
        "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "ends_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_by_user_id" uuid NOT NULL,
        "winner_participant_id" uuid,
        "winner_value" numeric,
        "finished_at" TIMESTAMP WITH TIME ZONE,
        "cancelled_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "challenges_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_challenges_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      );
      CREATE INDEX IF NOT EXISTS "idx_challenges_status" ON "challenges" ("status");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "challenge_participants" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "challenge_id" uuid NOT NULL,
        "participant_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "challenge_participants_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "challenge_participants_challenge_participant_key" UNIQUE ("challenge_id", "participant_id"),
        CONSTRAINT "FK_challenge_participants_challenge" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "challenge_participants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "challenges"`);
  }
}
