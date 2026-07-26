import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLiquidations1784600000000 implements MigrationInterface {
  name = 'CreateLiquidations1784600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "liquidation_records" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "employee_id" uuid NOT NULL,
        "registered_by_user_id" uuid NOT NULL,
        "source_role" varchar(20) NOT NULL,
        "occurred_at" timestamptz NOT NULL,
        "service_total" numeric(12,2) NOT NULL,
        "payment_method" varchar(20) NOT NULL,
        "cash_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "card_amounts" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "company_percentage" numeric(5,2) NOT NULL DEFAULT 40,
        "extra_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "promotion" boolean NOT NULL DEFAULT false,
        "membership_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "company_transport_expense" numeric(12,2) NOT NULL DEFAULT 0,
        "transport_excess" numeric(12,2) NOT NULL DEFAULT 0,
        "place" varchar(120),
        "has_outbound_driver" boolean NOT NULL DEFAULT false,
        "has_return_driver" boolean NOT NULL DEFAULT false,
        "cancelled" boolean NOT NULL DEFAULT false,
        "is_fine" boolean NOT NULL DEFAULT false,
        "fine_amount" numeric(12,2) NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_liquidation_records" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_liquidation_source_role" CHECK ("source_role" IN ('admin', 'jefe', 'empleada')),
        CONSTRAINT "CHK_liquidation_payment_method" CHECK ("payment_method" IN ('efectivo', 'tarjeta', 'transferencia', 'mixto', 'membresia')),
        CONSTRAINT "FK_liquidation_records_employee" FOREIGN KEY ("employee_id") REFERENCES "empleadas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_liquidation_records_actor" FOREIGN KEY ("registered_by_user_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_liquidation_records_employee_date" ON "liquidation_records" ("employee_id", "occurred_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_liquidation_records_occurred_at" ON "liquidation_records" ("occurred_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "liquidation_debts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "employee_id" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "description" varchar(300) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "created_by_user_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_liquidation_debts" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_liquidation_debt_status" CHECK ("status" IN ('pending', 'paid')),
        CONSTRAINT "CHK_liquidation_debt_amount" CHECK ("amount" > 0),
        CONSTRAINT "FK_liquidation_debts_employee" FOREIGN KEY ("employee_id") REFERENCES "empleadas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_liquidation_debts_actor" FOREIGN KEY ("created_by_user_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_liquidation_debts_employee_status" ON "liquidation_debts" ("employee_id", "status") WHERE "deleted_at" IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "liquidation_payments" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "debt_id" uuid NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "note" varchar(300),
        "created_by_user_id" uuid NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "deleted_at" timestamptz,
        CONSTRAINT "PK_liquidation_payments" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_liquidation_payment_amount" CHECK ("amount" > 0),
        CONSTRAINT "FK_liquidation_payments_debt" FOREIGN KEY ("debt_id") REFERENCES "liquidation_debts"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_liquidation_payments_actor" FOREIGN KEY ("created_by_user_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_liquidation_payments_debt_created" ON "liquidation_payments" ("debt_id", "created_at") WHERE "deleted_at" IS NULL`,
    );

    await queryRunner.query(`
      CREATE TABLE "liquidation_audit_log" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "entity_type" varchar(30) NOT NULL,
        "entity_id" uuid NOT NULL,
        "action" varchar(30) NOT NULL,
        "actor_user_id" uuid NOT NULL,
        "before_value" jsonb,
        "after_value" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_liquidation_audit_log" PRIMARY KEY ("id"),
        CONSTRAINT "FK_liquidation_audit_actor" FOREIGN KEY ("actor_user_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_liquidation_audit_entity" ON "liquidation_audit_log" ("entity_type", "entity_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "liquidation_audit_log"`);
    await queryRunner.query(`DROP TABLE "liquidation_payments"`);
    await queryRunner.query(`DROP TABLE "liquidation_debts"`);
    await queryRunner.query(`DROP TABLE "liquidation_records"`);
  }
}
