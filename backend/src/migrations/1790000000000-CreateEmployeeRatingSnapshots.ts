import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmployeeRatingSnapshots1790000000000 implements MigrationInterface {
  name = 'CreateEmployeeRatingSnapshots1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_rating_snapshots" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "employee_id" uuid NOT NULL,
        "average" numeric,
        "rating_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "employee_rating_snapshots_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_employee_rating_snapshots_employee" FOREIGN KEY ("employee_id") REFERENCES "empleadas"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      );
      CREATE INDEX IF NOT EXISTS "idx_employee_rating_snapshots_employee" ON "employee_rating_snapshots" ("employee_id", "created_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_rating_snapshots"`);
  }
}
