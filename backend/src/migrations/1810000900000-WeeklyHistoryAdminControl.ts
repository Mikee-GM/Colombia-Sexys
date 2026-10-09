import { MigrationInterface, QueryRunner } from 'typeorm';

export class WeeklyHistoryAdminControl1810000900000 implements MigrationInterface {
  name = 'WeeklyHistoryAdminControl1810000900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "servicios"
        ADD COLUMN "service_base_amount_snapshot" numeric(12,2),
        ADD COLUMN "employee_percentage_snapshot" numeric(5,2) NOT NULL DEFAULT 60,
        ADD COLUMN "financial_snapshot_status" varchar(24) NOT NULL DEFAULT 'captured',
        ADD COLUMN "administrative_void_at" timestamptz,
        ADD COLUMN "administrative_void_by_user_id" uuid REFERENCES "usuarios"("id") ON DELETE SET NULL,
        ADD COLUMN "administrative_void_reason" text,
        ADD COLUMN "administrative_review_required" boolean NOT NULL DEFAULT false,
        ADD COLUMN "deleted_at" timestamptz,
        ADD COLUMN "deleted_by_user_id" uuid REFERENCES "usuarios"("id") ON DELETE SET NULL,
        ADD COLUMN "delete_reason" text,
        ADD COLUMN "previous_status" varchar(30),
        ADD COLUMN "previous_operational_state" varchar(60);

      UPDATE "servicios" service
      SET "service_base_amount_snapshot" = GREATEST(
        0,
        (service."duracion_pactada_horas" - COALESCE((
          SELECT SUM(extension."horas_agregadas")
          FROM "extensiones_servicio" extension
          WHERE extension."servicio_id" = service."id"
        ), 0)) * service."precio_base_hora_pactado"
      ),
      "financial_snapshot_status" = 'legacy_backfill';

      ALTER TABLE "servicios"
        ALTER COLUMN "service_base_amount_snapshot" SET NOT NULL;
      CREATE INDEX "idx_servicios_deleted_at" ON "servicios" ("deleted_at");

      ALTER TABLE "extensiones_servicio"
        ADD COLUMN "employee_percentage_snapshot" numeric(5,2) NOT NULL DEFAULT 60,
        ADD COLUMN "employee_expected_snapshot" numeric(12,2),
        ADD COLUMN "financial_snapshot_status" varchar(24) NOT NULL DEFAULT 'captured';
      UPDATE "extensiones_servicio"
      SET "employee_expected_snapshot" = ROUND("monto_agregado" * 0.60, 2),
          "financial_snapshot_status" = 'legacy_backfill';
      ALTER TABLE "extensiones_servicio"
        ALTER COLUMN "employee_expected_snapshot" SET NOT NULL;

      ALTER TABLE "extras_servicio"
        ADD COLUMN "company_percentage_snapshot" numeric(5,2) NOT NULL DEFAULT 0,
        ADD COLUMN "commission_threshold_snapshot" numeric(12,2),
        ADD COLUMN "company_commission_snapshot" numeric(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN "employee_net_snapshot" numeric(12,2),
        ADD COLUMN "financial_snapshot_status" varchar(24) NOT NULL DEFAULT 'captured';
      UPDATE "extras_servicio"
      SET "employee_net_snapshot" = "precio_cobrado",
          "financial_snapshot_status" = 'legacy_unverified';
      ALTER TABLE "extras_servicio"
        ALTER COLUMN "employee_net_snapshot" SET NOT NULL;

      ALTER TABLE "liquidation_records"
        ADD COLUMN "card_extra_items" jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN "excluded_from_cut" boolean NOT NULL DEFAULT false,
        ADD COLUMN "historical_service_id" uuid;
      UPDATE "liquidation_records" record
      SET "historical_service_id" = record."service_id",
          "card_extra_items" = COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'amount', extra."precio_cobrado",
              'companyCommission', extra."company_commission_snapshot",
              'employeeNet', extra."employee_net_snapshot",
              'snapshotStatus', extra."financial_snapshot_status"
            ) ORDER BY extra."registrado_at", extra."id")
            FROM "extras_servicio" extra
            WHERE extra."servicio_id" = record."service_id"
              AND extra."metodo_pago" = 'tarjeta'
          ), '[]'::jsonb);

      ALTER TABLE "employee_cash_obligations"
        ADD COLUMN "historical_service_id" uuid,
        ADD COLUMN "administratively_excluded" boolean NOT NULL DEFAULT false;
      UPDATE "employee_cash_obligations"
        SET "historical_service_id" = "service_id";

      CREATE TABLE "service_admin_audit" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "service_id" uuid NOT NULL,
        "action" varchar(40) NOT NULL,
        "actor_id" uuid NOT NULL,
        "actor_role" varchar(20) NOT NULL,
        "reason" text NOT NULL,
        "previous_state" varchar(40),
        "previous_operational_state" varchar(60),
        "financial_snapshot" jsonb NOT NULL,
        "affected_dependencies" jsonb NOT NULL,
        "result" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX "idx_service_admin_audit_service_created"
        ON "service_admin_audit" ("service_id", "created_at" DESC);

      ALTER TABLE "conversaciones_telegram"
        ADD COLUMN "historical_service_id" uuid;
      UPDATE "conversaciones_telegram"
        SET "historical_service_id" = "servicio_id"
        WHERE "servicio_id" IS NOT NULL;

      ALTER TABLE "interaction_ratings"
        ADD COLUMN "historical_service_id" uuid,
        ADD COLUMN "historical_trip_id" uuid;
      UPDATE "interaction_ratings"
        SET "historical_service_id" = "service_id",
            "historical_trip_id" = "trip_id";
      ALTER TABLE "interaction_ratings"
        DROP CONSTRAINT IF EXISTS "CHK_interaction_ratings_reference";
      ALTER TABLE "interaction_ratings" ADD CONSTRAINT "CHK_interaction_ratings_reference" CHECK (
        (("service_id" IS NOT NULL OR "historical_service_id" IS NOT NULL)
          AND ("trip_id" IS NULL AND "historical_trip_id" IS NULL)
          AND "direction" IN ('client_to_employee', 'employee_to_client'))
        OR
        (("service_id" IS NOT NULL OR "historical_service_id" IS NOT NULL)
          AND ("trip_id" IS NOT NULL OR "historical_trip_id" IS NOT NULL)
          AND "direction" IN ('driver_to_employee', 'employee_to_driver'))
      );

      ALTER TABLE "conduct_reports"
        ADD COLUMN "historical_service_id" uuid,
        ADD COLUMN "historical_trip_id" uuid;
      UPDATE "conduct_reports"
        SET "historical_service_id" = "service_id",
            "historical_trip_id" = "trip_id";

      ALTER TABLE "employee_reports"
        ADD COLUMN "historical_service_id" uuid;
      UPDATE "employee_reports" SET "historical_service_id" = "service_id";

      ALTER TABLE "liquidation_records"
        DROP CONSTRAINT IF EXISTS "FK_liquidation_records_service",
        ALTER COLUMN "service_id" DROP NOT NULL;
      ALTER TABLE "liquidation_records"
        ADD CONSTRAINT "FK_liquidation_records_service" FOREIGN KEY ("service_id")
        REFERENCES "servicios"("id") ON DELETE SET NULL;

      ALTER TABLE "employee_cash_obligations"
        DROP CONSTRAINT IF EXISTS "employee_cash_obligations_service_id_fkey",
        ALTER COLUMN "service_id" DROP NOT NULL;
      ALTER TABLE "employee_cash_obligations"
        ADD CONSTRAINT "FK_employee_cash_obligations_service" FOREIGN KEY ("service_id")
        REFERENCES "servicios"("id") ON DELETE SET NULL;

      ALTER TABLE "interaction_ratings"
        DROP CONSTRAINT IF EXISTS "FK_interaction_ratings_service",
        DROP CONSTRAINT IF EXISTS "FK_interaction_ratings_trip";
      ALTER TABLE "interaction_ratings"
        ADD CONSTRAINT "FK_interaction_ratings_service" FOREIGN KEY ("service_id")
          REFERENCES "servicios"("id") ON DELETE SET NULL,
        ADD CONSTRAINT "FK_interaction_ratings_trip" FOREIGN KEY ("trip_id")
          REFERENCES "viajes"("id") ON DELETE SET NULL;

      ALTER TABLE "conduct_reports"
        DROP CONSTRAINT IF EXISTS "FK_conduct_reports_service",
        DROP CONSTRAINT IF EXISTS "FK_conduct_reports_trip";
      ALTER TABLE "conduct_reports"
        ADD CONSTRAINT "FK_conduct_reports_service" FOREIGN KEY ("service_id")
          REFERENCES "servicios"("id") ON DELETE SET NULL,
        ADD CONSTRAINT "FK_conduct_reports_trip" FOREIGN KEY ("trip_id")
          REFERENCES "viajes"("id") ON DELETE SET NULL;

      ALTER TABLE "employee_reports"
        DROP CONSTRAINT IF EXISTS "FK_employee_reports_service",
        DROP CONSTRAINT IF EXISTS "UQ_employee_reports_reporter_service_category",
        ALTER COLUMN "service_id" DROP NOT NULL;
      CREATE UNIQUE INDEX "uq_employee_reports_historical_reference"
        ON "employee_reports" ("reporter_key", COALESCE("service_id", "historical_service_id"), "category");
      ALTER TABLE "employee_reports"
        ADD CONSTRAINT "FK_employee_reports_service" FOREIGN KEY ("service_id")
          REFERENCES "servicios"("id") ON DELETE SET NULL;
    `);

    // El trigger captura el importe original una sola vez. Las extensiones
    // posteriores pueden cambiar duracion/total_base sin reescribir el pacto.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION calcular_total_servicio()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.service_base_amount_snapshot := COALESCE(
          NEW.service_base_amount_snapshot,
          NEW.duracion_pactada_horas * NEW.precio_base_hora_pactado
        );
        NEW.total_base := NEW.duracion_pactada_horas * NEW.precio_base_hora_pactado;
        NEW.total_final := NEW.total_base + COALESCE(NEW.total_extras, 0)
          + COALESCE(NEW.total_transporte, 0);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "service_admin_audit";
      DROP INDEX IF EXISTS "idx_servicios_deleted_at";
      DROP INDEX IF EXISTS "uq_employee_reports_historical_reference";

      UPDATE "employee_reports" report SET "service_id" = report."historical_service_id"
        WHERE report."service_id" IS NULL AND EXISTS (
          SELECT 1 FROM "servicios" service WHERE service."id" = report."historical_service_id"
        );
      UPDATE "interaction_ratings" rating SET
        "service_id" = COALESCE(rating."service_id", rating."historical_service_id"),
        "trip_id" = COALESCE(rating."trip_id", rating."historical_trip_id");
      UPDATE "conduct_reports" report SET
        "service_id" = COALESCE(report."service_id", report."historical_service_id"),
        "trip_id" = COALESCE(report."trip_id", report."historical_trip_id");

      ALTER TABLE "employee_reports" DROP CONSTRAINT IF EXISTS "FK_employee_reports_service";
      ALTER TABLE "employee_reports" ALTER COLUMN "service_id" SET NOT NULL;
      ALTER TABLE "employee_reports" ADD CONSTRAINT "UQ_employee_reports_reporter_service_category"
        UNIQUE ("reporter_key", "service_id", "category");
      ALTER TABLE "employee_reports" ADD CONSTRAINT "FK_employee_reports_service"
        FOREIGN KEY ("service_id") REFERENCES "servicios"("id") ON DELETE RESTRICT;

      ALTER TABLE "conduct_reports"
        DROP CONSTRAINT IF EXISTS "FK_conduct_reports_service",
        DROP CONSTRAINT IF EXISTS "FK_conduct_reports_trip";
      ALTER TABLE "conduct_reports"
        ADD CONSTRAINT "FK_conduct_reports_service" FOREIGN KEY ("service_id")
          REFERENCES "servicios"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "FK_conduct_reports_trip" FOREIGN KEY ("trip_id")
          REFERENCES "viajes"("id") ON DELETE RESTRICT;

      ALTER TABLE "interaction_ratings"
        DROP CONSTRAINT IF EXISTS "FK_interaction_ratings_service",
        DROP CONSTRAINT IF EXISTS "FK_interaction_ratings_trip";
      ALTER TABLE "interaction_ratings"
        ADD CONSTRAINT "FK_interaction_ratings_service" FOREIGN KEY ("service_id")
          REFERENCES "servicios"("id") ON DELETE RESTRICT,
        ADD CONSTRAINT "FK_interaction_ratings_trip" FOREIGN KEY ("trip_id")
          REFERENCES "viajes"("id") ON DELETE RESTRICT;

      ALTER TABLE "employee_cash_obligations"
        DROP CONSTRAINT IF EXISTS "FK_employee_cash_obligations_service";
      UPDATE "employee_cash_obligations" obligation
        SET "service_id" = obligation."historical_service_id"
        WHERE obligation."service_id" IS NULL AND EXISTS (
          SELECT 1 FROM "servicios" service WHERE service."id" = obligation."historical_service_id"
        );
      ALTER TABLE "employee_cash_obligations" ALTER COLUMN "service_id" SET NOT NULL;
      ALTER TABLE "employee_cash_obligations" ADD CONSTRAINT "employee_cash_obligations_service_id_fkey"
        FOREIGN KEY ("service_id") REFERENCES "servicios"("id") ON DELETE RESTRICT;

      ALTER TABLE "liquidation_records" DROP CONSTRAINT IF EXISTS "FK_liquidation_records_service";
      ALTER TABLE "liquidation_records" ADD CONSTRAINT "FK_liquidation_records_service"
        FOREIGN KEY ("service_id") REFERENCES "servicios"("id") ON DELETE RESTRICT;

      ALTER TABLE "employee_reports" DROP COLUMN IF EXISTS "historical_service_id";
      ALTER TABLE "conduct_reports"
        DROP COLUMN IF EXISTS "historical_trip_id",
        DROP COLUMN IF EXISTS "historical_service_id";
      ALTER TABLE "interaction_ratings"
        DROP CONSTRAINT IF EXISTS "CHK_interaction_ratings_reference";
      ALTER TABLE "interaction_ratings" ADD CONSTRAINT "CHK_interaction_ratings_reference" CHECK (
        ("service_id" IS NOT NULL AND "trip_id" IS NULL
          AND "direction" IN ('client_to_employee', 'employee_to_client'))
        OR
        ("service_id" IS NOT NULL AND "trip_id" IS NOT NULL
          AND "direction" IN ('driver_to_employee', 'employee_to_driver'))
      );
      ALTER TABLE "interaction_ratings"
        DROP COLUMN IF EXISTS "historical_trip_id",
        DROP COLUMN IF EXISTS "historical_service_id";
      ALTER TABLE "conversaciones_telegram"
        DROP COLUMN IF EXISTS "historical_service_id";
      ALTER TABLE "employee_cash_obligations"
        DROP COLUMN IF EXISTS "administratively_excluded",
        DROP COLUMN IF EXISTS "historical_service_id";
      ALTER TABLE "liquidation_records"
        DROP COLUMN IF EXISTS "historical_service_id",
        DROP COLUMN IF EXISTS "excluded_from_cut",
        DROP COLUMN IF EXISTS "card_extra_items";
      ALTER TABLE "extras_servicio"
        DROP COLUMN IF EXISTS "financial_snapshot_status",
        DROP COLUMN IF EXISTS "employee_net_snapshot",
        DROP COLUMN IF EXISTS "company_commission_snapshot",
        DROP COLUMN IF EXISTS "commission_threshold_snapshot",
        DROP COLUMN IF EXISTS "company_percentage_snapshot";
      ALTER TABLE "extensiones_servicio"
        DROP COLUMN IF EXISTS "financial_snapshot_status",
        DROP COLUMN IF EXISTS "employee_expected_snapshot",
        DROP COLUMN IF EXISTS "employee_percentage_snapshot";
      ALTER TABLE "servicios"
        DROP COLUMN IF EXISTS "previous_operational_state",
        DROP COLUMN IF EXISTS "previous_status",
        DROP COLUMN IF EXISTS "delete_reason",
        DROP COLUMN IF EXISTS "deleted_by_user_id",
        DROP COLUMN IF EXISTS "deleted_at",
        DROP COLUMN IF EXISTS "administrative_review_required",
        DROP COLUMN IF EXISTS "administrative_void_reason",
        DROP COLUMN IF EXISTS "administrative_void_by_user_id",
        DROP COLUMN IF EXISTS "administrative_void_at",
        DROP COLUMN IF EXISTS "financial_snapshot_status",
        DROP COLUMN IF EXISTS "employee_percentage_snapshot",
        DROP COLUMN IF EXISTS "service_base_amount_snapshot";

      CREATE OR REPLACE FUNCTION calcular_total_servicio()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.total_base := NEW.duracion_pactada_horas * NEW.precio_base_hora_pactado;
        NEW.total_final := NEW.total_base + COALESCE(NEW.total_extras, 0)
          + COALESCE(NEW.total_transporte, 0);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
  }
}
