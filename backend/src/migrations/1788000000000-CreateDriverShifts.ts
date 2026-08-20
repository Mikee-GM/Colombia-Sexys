import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDriverShifts1788000000000 implements MigrationInterface {
  name = 'CreateDriverShifts1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "driver_shifts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" character varying(120) NOT NULL,
        "starts_at" character varying(5) NOT NULL,
        "ends_at" character varying(5) NOT NULL,
        "days_of_week" smallint[] NOT NULL,
        "capacity" integer,
        "active" boolean NOT NULL DEFAULT true,
        "created_by_user_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "driver_shifts_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "FK_driver_shifts_created_by" FOREIGN KEY ("created_by_user_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE NO ACTION
      );
      CREATE INDEX IF NOT EXISTS "idx_driver_shifts_active" ON "driver_shifts" ("active");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "driver_shift_assignments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "shift_id" uuid NOT NULL,
        "driver_id" uuid NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "driver_shift_assignments_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "driver_shift_assignments_shift_driver_key" UNIQUE ("shift_id", "driver_id"),
        CONSTRAINT "FK_driver_shift_assignments_shift" FOREIGN KEY ("shift_id") REFERENCES "driver_shifts"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_driver_shift_assignments_driver" FOREIGN KEY ("driver_id") REFERENCES "choferes"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      );
      CREATE INDEX IF NOT EXISTS "idx_driver_shift_assignments_driver" ON "driver_shift_assignments" ("driver_id");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "driver_shift_assignments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "driver_shifts"`);
  }
}
