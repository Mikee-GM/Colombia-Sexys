import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOptionsToScreeningQuestions1786100000000 implements MigrationInterface {
  name = 'AddOptionsToScreeningQuestions1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "screening_questions"
        ADD COLUMN IF NOT EXISTS "options" jsonb DEFAULT '[]'::jsonb;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "screening_questions"
        DROP COLUMN IF EXISTS "options";
    `);
  }
}
