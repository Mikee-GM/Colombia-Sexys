import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmployeeReports1784500000000 implements MigrationInterface {
  name = 'CreateEmployeeReports1784500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."employee_reports_origin_enum" AS ENUM('cliente','chofer')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."employee_reports_category_enum" AS ENUM('trato_inadecuado','demora_impuntualidad','incumplimiento','cobro','seguridad','otro')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."employee_reports_priority_enum" AS ENUM('normal','alta','urgente')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."employee_reports_status_enum" AS ENUM('nuevo','en_revision','resuelto','descartado')`,
    );
    await queryRunner.query(`
      CREATE TABLE "employee_reports" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "service_id" uuid NOT NULL,
        "employee_id" uuid NOT NULL,
        "boss_id" uuid NOT NULL,
        "origin" "public"."employee_reports_origin_enum" NOT NULL,
        "client_id" uuid,
        "driver_id" uuid,
        "reporter_key" varchar(80) NOT NULL,
        "category" "public"."employee_reports_category_enum" NOT NULL,
        "description" text NOT NULL,
        "priority" "public"."employee_reports_priority_enum" NOT NULL DEFAULT 'normal',
        "status" "public"."employee_reports_status_enum" NOT NULL DEFAULT 'nuevo',
        "assigned_admin_id" uuid,
        "resolution" text,
        "resolved_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_reports" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_employee_reports_author" CHECK ((origin = 'cliente' AND client_id IS NOT NULL AND driver_id IS NULL) OR (origin = 'chofer' AND driver_id IS NOT NULL AND client_id IS NULL)),
        CONSTRAINT "UQ_employee_reports_reporter_service_category" UNIQUE ("reporter_key", "service_id", "category"),
        CONSTRAINT "FK_employee_reports_service" FOREIGN KEY ("service_id") REFERENCES "servicios"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_employee_reports_employee" FOREIGN KEY ("employee_id") REFERENCES "empleadas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_employee_reports_boss" FOREIGN KEY ("boss_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_employee_reports_client" FOREIGN KEY ("client_id") REFERENCES "clientes"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_employee_reports_driver" FOREIGN KEY ("driver_id") REFERENCES "choferes"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_employee_reports_admin" FOREIGN KEY ("assigned_admin_id") REFERENCES "usuarios"("id") ON DELETE SET NULL
      )`);
    await queryRunner.query(
      `CREATE INDEX "idx_employee_reports_status_priority" ON "employee_reports" ("status", "priority")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_employee_reports_employee_created" ON "employee_reports" ("employee_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_employee_reports_boss_created" ON "employee_reports" ("boss_id", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "employee_report_history" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "report_id" uuid NOT NULL,
        "actor_user_id" uuid,
        "action" varchar(40) NOT NULL,
        "metadata" jsonb,
        "note" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_report_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_employee_report_history_report" FOREIGN KEY ("report_id") REFERENCES "employee_reports"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_employee_report_history_actor" FOREIGN KEY ("actor_user_id") REFERENCES "usuarios"("id") ON DELETE SET NULL
      )`);
    await queryRunner.query(
      `CREATE INDEX "idx_employee_report_history_report_created" ON "employee_report_history" ("report_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "employee_report_history"`);
    await queryRunner.query(`DROP TABLE "employee_reports"`);
    await queryRunner.query(
      `DROP TYPE "public"."employee_reports_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."employee_reports_priority_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."employee_reports_category_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."employee_reports_origin_enum"`,
    );
  }
}
