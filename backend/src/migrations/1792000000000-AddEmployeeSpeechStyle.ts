import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmployeeSpeechStyle1792000000000 implements MigrationInterface {
  name = 'AddEmployeeSpeechStyle1792000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "empleadas" ADD COLUMN IF NOT EXISTS "estilo_habla" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "empleadas" DROP COLUMN IF EXISTS "estilo_habla"`,
    );
  }
}
