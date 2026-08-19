import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCandidateScreening1785900000000 implements MigrationInterface {
  name = 'CreateCandidateScreening1785900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "screening_questions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "text" text NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "display_order" smallint NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "screening_questions_pkey" PRIMARY KEY ("id")
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "candidate_screenings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "candidate_name" character varying(255) NOT NULL,
        "candidate_phone" character varying(30),
        "token" character varying(64) NOT NULL,
        "telegram_chat_id" character varying(64),
        "status" character varying(20) NOT NULL DEFAULT 'pendiente',
        "question_ids" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "created_by_user_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "started_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "promoted_employee_id" uuid,
        CONSTRAINT "candidate_screenings_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "candidate_screenings_token_key" UNIQUE ("token"),
        CONSTRAINT "FK_candidate_screenings_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION,
        CONSTRAINT "FK_candidate_screenings_promoted_employee" FOREIGN KEY ("promoted_employee_id") REFERENCES "empleadas"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      );
      CREATE INDEX IF NOT EXISTS "idx_candidate_screenings_status" ON "candidate_screenings" ("status");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "candidate_screening_answers" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "screening_id" uuid NOT NULL,
        "question_id" uuid NOT NULL,
        "question_text" text NOT NULL,
        "answer_text" text NOT NULL,
        "answered_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "candidate_screening_answers_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "candidate_screening_answers_screening_question_key" UNIQUE ("screening_id", "question_id"),
        CONSTRAINT "FK_candidate_screening_answers_screening" FOREIGN KEY ("screening_id") REFERENCES "candidate_screenings"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "candidate_screening_answers"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "candidate_screenings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "screening_questions"`);
  }
}
