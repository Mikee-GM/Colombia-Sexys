import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeparateCashAndWeeklySettlement1784900000000 implements MigrationInterface {
  name = 'SeparateCashAndWeeklySettlement1784900000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "employee_cash_obligations"
        ADD COLUMN "calculation_status" varchar(20) NOT NULL DEFAULT 'provisional',
        ADD COLUMN "pending_reason" varchar(240),
        ADD COLUMN "customer_total" numeric(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN "uber_deduction" numeric(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN "service_date" timestamptz;
      ALTER TABLE "employee_cash_obligations" ADD CONSTRAINT "CHK_cash_obligation_calculation_status"
        CHECK ("calculation_status" IN ('provisional','ready','paid'));
      ALTER TABLE "employee_cash_payments" ADD COLUMN "origin" varchar(20) NOT NULL DEFAULT 'physical';
      ALTER TABLE "liquidation_records" ADD COLUMN "electronic_extra_amount" numeric(12,2) NOT NULL DEFAULT 0;
      CREATE TABLE "employee_weekly_settlements" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "employee_id" uuid NOT NULL REFERENCES "empleadas"("id") ON DELETE RESTRICT,
        "week_start" date NOT NULL,
        "week_end" date NOT NULL,
        "gross_employee_pay" numeric(12,2) NOT NULL,
        "cash_offset" numeric(12,2) NOT NULL,
        "net_employee_pay" numeric(12,2) NOT NULL,
        "remaining_cash_debt" numeric(12,2) NOT NULL,
        "confirmed_by_user_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "confirmed_at" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("employee_id", "week_start")
      );
      UPDATE "employee_cash_obligations" o SET
        "amount" = GREATEST(0, s."total_final" - COALESCE((
          SELECT SUM(v."tarifa") FROM "viajes" v
          WHERE v."servicio_id" = s."id" AND v."proveedor_transporte" = 'uber' AND v."estado" NOT IN ('cancelado','rechazado') AND v."fare_confirmed_at" IS NOT NULL
        ), 0)),
        "customer_total" = s."total_final",
        "service_date" = s."hora_fin_servicio",
        "uber_deduction" = COALESCE((SELECT SUM(v."tarifa") FROM "viajes" v WHERE v."servicio_id" = s."id" AND v."proveedor_transporte" = 'uber' AND v."estado" NOT IN ('cancelado','rechazado') AND v."fare_confirmed_at" IS NOT NULL), 0),
        "calculation_status" = CASE WHEN EXISTS (SELECT 1 FROM "viajes" r WHERE r."servicio_id" = s."id" AND r."tipo" = 'regreso') AND NOT EXISTS (SELECT 1 FROM "viajes" u WHERE u."servicio_id" = s."id" AND u."proveedor_transporte" = 'uber' AND u."estado" NOT IN ('cancelado','rechazado') AND (u."estado" <> 'finalizado' OR u."fare_confirmed_at" IS NULL)) THEN 'ready' ELSE 'provisional' END,
        "pending_reason" = CASE WHEN NOT EXISTS (SELECT 1 FROM "viajes" r WHERE r."servicio_id" = s."id" AND r."tipo" = 'regreso') THEN 'Falta definir el viaje de regreso' WHEN EXISTS (SELECT 1 FROM "viajes" u WHERE u."servicio_id" = s."id" AND u."proveedor_transporte" = 'uber' AND u."estado" NOT IN ('cancelado','rechazado') AND (u."estado" <> 'finalizado' OR u."fare_confirmed_at" IS NULL)) THEN 'Falta finalizar y confirmar una tarifa de Uber' ELSE NULL END
      FROM "servicios" s WHERE o."service_id" = s."id" AND o."status" <> 'paid';
      UPDATE "employee_cash_obligations" o SET "service_date" = s."hora_fin_servicio" FROM "servicios" s WHERE o."service_id" = s."id" AND o."service_date" IS NULL;
      ALTER TABLE "employee_cash_obligations" ALTER COLUMN "service_date" SET NOT NULL;
    `);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "employee_weekly_settlements"; ALTER TABLE "liquidation_records" DROP COLUMN IF EXISTS "electronic_extra_amount"; ALTER TABLE "employee_cash_payments" DROP COLUMN IF EXISTS "origin"; ALTER TABLE "employee_cash_obligations" DROP CONSTRAINT IF EXISTS "CHK_cash_obligation_calculation_status"; ALTER TABLE "employee_cash_obligations" DROP COLUMN IF EXISTS "service_date", DROP COLUMN IF EXISTS "uber_deduction", DROP COLUMN IF EXISTS "customer_total", DROP COLUMN IF EXISTS "pending_reason", DROP COLUMN IF EXISTS "calculation_status";`,
    );
  }
}
