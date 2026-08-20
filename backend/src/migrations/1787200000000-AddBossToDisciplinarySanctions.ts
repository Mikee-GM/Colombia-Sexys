import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBossToDisciplinarySanctions1787200000000 implements MigrationInterface {
  name = 'AddBossToDisciplinarySanctions1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "disciplinary_sanctions"
        DROP CONSTRAINT IF EXISTS "CHK_disciplinary_sanctions_subject";
    `);

    await queryRunner.query(`
      ALTER TABLE "disciplinary_sanctions"
        ADD CONSTRAINT "CHK_disciplinary_sanctions_subject"
        CHECK ("subject_type" IN ('client', 'employee', 'driver', 'boss'));
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "disciplinary_sanctions"
        DROP CONSTRAINT IF EXISTS "CHK_disciplinary_sanctions_subject";
    `);

    await queryRunner.query(`
      ALTER TABLE "disciplinary_sanctions"
        ADD CONSTRAINT "CHK_disciplinary_sanctions_subject"
        CHECK ("subject_type" IN ('client', 'employee', 'driver'));
    `);
  }
}
