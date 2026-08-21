import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGroupKeyToRegulationQuestions1789000000000 implements MigrationInterface {
  name = 'AddGroupKeyToRegulationQuestions1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "regulation_questions"
        ADD COLUMN IF NOT EXISTS "group_key" character varying(60);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "regulation_questions" DROP COLUMN IF EXISTS "group_key";
    `);
  }
}
