import { MigrationInterface, QueryRunner } from 'typeorm';

export class OperationalTransport1784800000000 implements MigrationInterface {
  name = 'OperationalTransport1784800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "transport_settings" (
        "id" smallint PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
        "external_location_fee" numeric(10,2) NOT NULL DEFAULT 0 CHECK ("external_location_fee" >= 0),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "updated_by_user_id" uuid REFERENCES "usuarios"("id") ON DELETE SET NULL
      );
      INSERT INTO "transport_settings" ("id", "external_location_fee") VALUES (1, 0);

      CREATE TABLE "preset_service_locations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(80) NOT NULL,
        "address" varchar(240) NOT NULL,
        "latitude" numeric(10,7) NOT NULL,
        "longitude" numeric(10,7) NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_preset_service_locations_active_order"
        ON "preset_service_locations" ("active", "sort_order");

      ALTER TABLE "servicios"
        ADD COLUMN "preset_location_id" uuid REFERENCES "preset_service_locations"("id") ON DELETE SET NULL,
        ADD COLUMN "location_name_snapshot" varchar(80),
        ADD COLUMN "location_address_snapshot" varchar(240),
        ADD COLUMN "customer_transport_charge" numeric(10,2),
        ADD COLUMN "actual_transport_cost" numeric(10,2) NOT NULL DEFAULT 0;

      UPDATE "servicios"
      SET "customer_transport_charge" = "total_transporte",
          "actual_transport_cost" = "total_transporte";

      ALTER TABLE "viajes"
        ADD COLUMN "driver_payout" numeric(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN "fare_confirmed_at" timestamptz,
        ADD COLUMN "fare_confirmed_by_user_id" uuid REFERENCES "usuarios"("id") ON DELETE SET NULL,
        ADD COLUMN "fare_confirmation_override" boolean NOT NULL DEFAULT false,
        ADD COLUMN "driver_settlement_id" uuid;

      CREATE TABLE "employee_cash_obligations" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "service_id" uuid NOT NULL UNIQUE REFERENCES "servicios"("id") ON DELETE RESTRICT,
        "employee_id" uuid NOT NULL REFERENCES "empleadas"("id") ON DELETE RESTRICT,
        "amount" numeric(12,2) NOT NULL CHECK ("amount" >= 0),
        "paid_amount" numeric(12,2) NOT NULL DEFAULT 0 CHECK ("paid_amount" >= 0),
        "status" varchar(20) NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','paid')),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_employee_cash_obligations_employee_status"
        ON "employee_cash_obligations" ("employee_id", "status", "created_at");

      CREATE TABLE "employee_cash_payments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "employee_id" uuid NOT NULL REFERENCES "empleadas"("id") ON DELETE RESTRICT,
        "amount" numeric(12,2) NOT NULL CHECK ("amount" > 0),
        "note" varchar(240),
        "registered_by_user_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE "employee_cash_payment_allocations" (
        "payment_id" uuid NOT NULL REFERENCES "employee_cash_payments"("id") ON DELETE CASCADE,
        "obligation_id" uuid NOT NULL REFERENCES "employee_cash_obligations"("id") ON DELETE RESTRICT,
        "amount" numeric(12,2) NOT NULL CHECK ("amount" > 0),
        PRIMARY KEY ("payment_id", "obligation_id")
      );

      CREATE TABLE "driver_settlements" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "driver_id" uuid NOT NULL REFERENCES "choferes"("id") ON DELETE RESTRICT,
        "week_start" date NOT NULL,
        "week_end" date NOT NULL,
        "total" numeric(12,2) NOT NULL DEFAULT 0,
        "status" varchar(20) NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending','paid')),
        "paid_at" timestamptz,
        "paid_by_user_id" uuid REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        UNIQUE ("driver_id", "week_start")
      );
      ALTER TABLE "viajes" ADD CONSTRAINT "FK_viajes_driver_settlement"
        FOREIGN KEY ("driver_settlement_id") REFERENCES "driver_settlements"("id") ON DELETE RESTRICT;

      ALTER TABLE "liquidation_records"
        ADD COLUMN "customer_transport_charge" numeric(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN "employee_uber_reimbursement" numeric(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN "employee_cash_due" numeric(12,2) NOT NULL DEFAULT 0;

      CREATE OR REPLACE FUNCTION calcular_total_servicio()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.total_base := NEW.duracion_pactada_horas * NEW.precio_base_hora_pactado;
        NEW.total_final := NEW.total_base + COALESCE(NEW.customer_transport_charge, NEW.total_transporte, 0);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION actualizar_total_transporte_servicio()
      RETURNS TRIGGER AS $$
      DECLARE v_servicio_id UUID;
      BEGIN
        v_servicio_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.servicio_id ELSE NEW.servicio_id END;
        UPDATE servicios SET actual_transport_cost = (
          SELECT COALESCE(SUM(tarifa), 0) FROM viajes
          WHERE servicio_id = v_servicio_id AND estado NOT IN ('cancelado', 'rechazado')
        ) WHERE id = v_servicio_id;
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "employee_cash_payment_allocations";
      DROP TABLE IF EXISTS "employee_cash_payments";
      DROP TABLE IF EXISTS "employee_cash_obligations";
      ALTER TABLE "viajes" DROP CONSTRAINT IF EXISTS "FK_viajes_driver_settlement";
      DROP TABLE IF EXISTS "driver_settlements";
      ALTER TABLE "liquidation_records" DROP COLUMN IF EXISTS "employee_cash_due", DROP COLUMN IF EXISTS "employee_uber_reimbursement", DROP COLUMN IF EXISTS "customer_transport_charge";
      ALTER TABLE "viajes" DROP COLUMN IF EXISTS "driver_settlement_id", DROP COLUMN IF EXISTS "fare_confirmation_override", DROP COLUMN IF EXISTS "fare_confirmed_by_user_id", DROP COLUMN IF EXISTS "fare_confirmed_at", DROP COLUMN IF EXISTS "driver_payout";
      ALTER TABLE "servicios" DROP COLUMN IF EXISTS "actual_transport_cost", DROP COLUMN IF EXISTS "customer_transport_charge", DROP COLUMN IF EXISTS "location_address_snapshot", DROP COLUMN IF EXISTS "location_name_snapshot", DROP COLUMN IF EXISTS "preset_location_id";
      DROP TABLE IF EXISTS "preset_service_locations";
      DROP TABLE IF EXISTS "transport_settings";
    `);
  }
}
