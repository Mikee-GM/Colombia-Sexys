import { MigrationInterface, QueryRunner } from 'typeorm';

export class ResetOnboardingHistory1807000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "employee_onboardings"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Cannot restore deleted data
  }
}
