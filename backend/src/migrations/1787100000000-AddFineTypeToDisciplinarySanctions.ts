import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFineTypeToDisciplinarySanctions1787100000000
  implements MigrationInterface
{
  name = 'AddFineTypeToDisciplinarySanctions1787100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "disciplinary_sanctions"
        ADD COLUMN IF NOT EXISTS "fine_amount" numeric(12,2) DEFAULT 0;
    `);

    await queryRunner.query(`
      ALTER TABLE "disciplinary_sanctions"
        DROP CONSTRAINT IF EXISTS "CHK_disciplinary_sanctions_type";
    `);

    await queryRunner.query(`
      ALTER TABLE "disciplinary_sanctions"
        ADD CONSTRAINT "CHK_disciplinary_sanctions_type"
        CHECK ("type" IN ('suspension', 'permanent_ban', 'fine'));
    `);

    await queryRunner.query(`
      ALTER TABLE "disciplinary_sanctions"
        DROP CONSTRAINT IF EXISTS "CHK_disciplinary_sanctions_dates";
    `);

    await queryRunner.query(`
      ALTER TABLE "disciplinary_sanctions"
        ADD CONSTRAINT "CHK_disciplinary_sanctions_dates"
        CHECK (
          ("type" = 'suspension' AND "ends_at" IS NOT NULL AND "ends_at" > "starts_at")
          OR ("type" = 'permanent_ban' AND "ends_at" IS NULL)
          OR ("type" = 'fine' AND ("fine_amount" IS NOT NULL AND "fine_amount" > 0))
        );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "disciplinary_sanctions"
        DROP CONSTRAINT IF EXISTS "CHK_disciplinary_sanctions_dates";
    `);

    await queryRunner.query(`
      ALTER TABLE "disciplinary_sanctions"
        ADD CONSTRAINT "CHK_disciplinary_sanctions_dates"
        CHECK (
          ("type" = 'suspension' AND "ends_at" IS NOT NULL AND "ends_at" > "starts_at")
          OR ("type" = 'permanent_ban' AND "ends_at" IS NULL)
        );
    `);

    await queryRunner.query(`
      ALTER TABLE "disciplinary_sanctions"
        DROP CONSTRAINT IF EXISTS "CHK_disciplinary_sanctions_type";
    `);

    await queryRunner.query(`
      ALTER TABLE "disciplinary_sanctions"
        ADD CONSTRAINT "CHK_disciplinary_sanctions_type"
        CHECK ("type" IN ('suspension', 'permanent_ban'));
    `);

    await queryRunner.query(`
      ALTER TABLE "disciplinary_sanctions"
        DROP COLUMN IF EXISTS "fine_amount";
    `);
  }
}
