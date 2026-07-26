import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGroupServices1785500000000 implements MigrationInterface {
  name = 'CreateGroupServices1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "servicios"
        ADD COLUMN "service_type" varchar(20) NOT NULL DEFAULT 'individual',
        ADD COLUMN "total_paid" numeric(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN "pending_balance" numeric(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN "transport_fee_snapshot" numeric(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN "manual_transport_adjustment" numeric(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN "pending_duration_hours" numeric(4,2);
      ALTER TABLE "servicios"
        ADD CONSTRAINT "CHK_servicios_service_type"
        CHECK ("service_type" IN ('individual', 'grupal'));

      CREATE TABLE "group_service_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "client_id" uuid NOT NULL REFERENCES "clientes"("id") ON DELETE RESTRICT,
        "boss_id" uuid NOT NULL REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        "initial_employee_id" uuid REFERENCES "empleadas"("id") ON DELETE SET NULL,
        "service_id" uuid UNIQUE REFERENCES "servicios"("id") ON DELETE SET NULL,
        "booking_session_id" uuid,
        "status" varchar(30) NOT NULL DEFAULT 'esperando_jefe',
        "duration_hours" numeric(4,2),
        "payment_method" varchar(20),
        "location_lat" numeric(10,7),
        "location_lng" numeric(10,7),
        "location_reference" varchar(240),
        "catalog_version" integer NOT NULL DEFAULT 0,
        "hold_expires_at" timestamptz,
        "ai_active" boolean NOT NULL DEFAULT false,
        "telegram_thread_id" bigint,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_group_request_status" CHECK ("status" IN (
          'esperando_jefe','seleccionando','reservada','esperando_pago',
          'confirmada','vencida','cancelada'
        )),
        CONSTRAINT "CHK_group_request_payment" CHECK (
          "payment_method" IS NULL OR "payment_method" IN
          ('efectivo','tarjeta','transferencia','mixto')
        )
      );
      CREATE INDEX "idx_group_requests_boss_status"
        ON "group_service_requests" ("boss_id", "status");
      CREATE INDEX "idx_group_requests_client_status"
        ON "group_service_requests" ("client_id", "status");

      CREATE TABLE "group_service_request_selections" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "request_id" uuid NOT NULL REFERENCES "group_service_requests"("id") ON DELETE CASCADE,
        "employee_id" uuid NOT NULL REFERENCES "empleadas"("id") ON DELETE RESTRICT,
        "status" varchar(20) NOT NULL DEFAULT 'reservada',
        "selected_by" varchar(20) NOT NULL,
        "hourly_rate_snapshot" numeric(10,2) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_group_request_employee" UNIQUE ("request_id", "employee_id"),
        CONSTRAINT "CHK_group_selection_status"
          CHECK ("status" IN ('seleccionada','reservada','liberada','confirmada')),
        CONSTRAINT "CHK_group_selection_actor"
          CHECK ("selected_by" IN ('cliente','jefe'))
      );
      CREATE INDEX "idx_group_selection_hold"
        ON "group_service_request_selections" ("employee_id", "status", "expires_at");

      CREATE TABLE "service_participants" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "service_id" uuid NOT NULL REFERENCES "servicios"("id") ON DELETE CASCADE,
        "employee_id" uuid NOT NULL REFERENCES "empleadas"("id") ON DELETE RESTRICT,
        "role" varchar(20) NOT NULL DEFAULT 'participante',
        "status" varchar(20) NOT NULL DEFAULT 'reservada',
        "hourly_rate_snapshot" numeric(10,2) NOT NULL,
        "billable_hours" numeric(4,2) NOT NULL,
        "confirmed_subtotal" numeric(12,2) NOT NULL,
        "hold_expires_at" timestamptz,
        "joined_at" timestamptz,
        "removed_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "uq_service_participant" UNIQUE ("service_id", "employee_id"),
        CONSTRAINT "CHK_service_participant_role"
          CHECK ("role" IN ('responsable','participante')),
        CONSTRAINT "CHK_service_participant_status"
          CHECK ("status" IN ('reservada','pendiente_pago','activa','retirada','cancelada')),
        CONSTRAINT "CHK_service_participant_amounts"
          CHECK ("hourly_rate_snapshot" >= 0 AND "billable_hours" >= 0 AND "confirmed_subtotal" >= 0)
      );
      CREATE UNIQUE INDEX "uq_service_responsible"
        ON "service_participants" ("service_id")
        WHERE "role" = 'responsable' AND "status" <> 'cancelada';
      CREATE INDEX "idx_participant_employee_status"
        ON "service_participants" ("employee_id", "status");

      INSERT INTO "service_participants" (
        "service_id", "employee_id", "role", "status",
        "hourly_rate_snapshot", "billable_hours", "confirmed_subtotal",
        "joined_at"
      )
      SELECT
        "id", "empleada_id", 'responsable',
        CASE
          WHEN "estado" = 'finalizado' THEN 'retirada'
          WHEN "estado" = 'cancelado' THEN 'cancelada'
          WHEN "estado" = 'en_curso' THEN 'activa'
          ELSE 'reservada'
        END,
        "precio_base_hora_pactado", "duracion_pactada_horas", "total_base",
        "hora_inicio_servicio"
      FROM "servicios";

      CREATE TABLE "service_payments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "service_id" uuid NOT NULL REFERENCES "servicios"("id") ON DELETE CASCADE,
        "receipt_validation_id" uuid REFERENCES "payment_receipt_validations"("id") ON DELETE SET NULL,
        "approved_by_user_id" uuid REFERENCES "usuarios"("id") ON DELETE SET NULL,
        "amount" numeric(12,2) NOT NULL CHECK ("amount" > 0),
        "status" varchar(20) NOT NULL DEFAULT 'pendiente'
          CHECK ("status" IN ('pendiente','aprobado','rechazado')),
        "fingerprint" varchar(180),
        "notes" varchar(300),
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX "uq_service_payment_fingerprint"
        ON "service_payments" ("fingerprint") WHERE "fingerprint" IS NOT NULL;
      CREATE INDEX "idx_service_payments_service_status"
        ON "service_payments" ("service_id", "status");

      CREATE TABLE "service_group_audit" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "service_id" uuid REFERENCES "servicios"("id") ON DELETE CASCADE,
        "request_id" uuid REFERENCES "group_service_requests"("id") ON DELETE CASCADE,
        "actor_user_id" uuid REFERENCES "usuarios"("id") ON DELETE SET NULL,
        "action" varchar(40) NOT NULL,
        "before" jsonb,
        "after" jsonb,
        "reason" varchar(300),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_group_audit_target"
          CHECK ("service_id" IS NOT NULL OR "request_id" IS NOT NULL)
      );
      CREATE INDEX "idx_group_audit_service_created"
        ON "service_group_audit" ("service_id", "created_at");
      CREATE INDEX "idx_group_audit_request_created"
        ON "service_group_audit" ("request_id", "created_at");

      ALTER TABLE "conversaciones_telegram"
        ADD COLUMN "group_request_id" uuid
        REFERENCES "group_service_requests"("id") ON DELETE SET NULL;
      CREATE INDEX "idx_conversations_group_request"
        ON "conversaciones_telegram" ("group_request_id", "enviado_at");

      ALTER TABLE "extras_servicio"
        ADD COLUMN "participant_id" uuid
        REFERENCES "service_participants"("id") ON DELETE SET NULL;
      UPDATE "extras_servicio" e
      SET "participant_id" = p."id"
      FROM "service_participants" p
      WHERE p."service_id" = e."servicio_id" AND p."role" = 'responsable';
      CREATE INDEX "idx_service_extras_participant"
        ON "extras_servicio" ("participant_id");

      DROP INDEX IF EXISTS "viajes_servicio_id_tipo_key";
      ALTER TABLE "viajes" ADD COLUMN "unit_number" smallint NOT NULL DEFAULT 1;
      CREATE UNIQUE INDEX "idx_viajes_servicio_tipo_unidad_key"
        ON "viajes" ("servicio_id", "tipo", "unit_number");

      CREATE TABLE "trip_passengers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "trip_id" uuid NOT NULL REFERENCES "viajes"("id") ON DELETE CASCADE,
        "employee_id" uuid NOT NULL REFERENCES "empleadas"("id") ON DELETE RESTRICT,
        CONSTRAINT "uq_trip_passenger" UNIQUE ("trip_id", "employee_id")
      );
      INSERT INTO "trip_passengers" ("trip_id", "employee_id")
      SELECT v."id", s."empleada_id"
      FROM "viajes" v
      INNER JOIN "servicios" s ON s."id" = v."servicio_id";

      DROP INDEX IF EXISTS "uq_liquidation_records_service";
      CREATE UNIQUE INDEX "uq_liquidation_records_service_employee"
        ON "liquidation_records" ("service_id", "employee_id")
        WHERE "service_id" IS NOT NULL;

      DROP INDEX IF EXISTS "UQ_interaction_rating_service_direction";
      CREATE UNIQUE INDEX "UQ_interaction_rating_service_direction_employee"
        ON "interaction_ratings" ("direction", "service_id", "employee_id")
        WHERE "service_id" IS NOT NULL AND "trip_id" IS NULL;

      CREATE OR REPLACE FUNCTION calcular_total_servicio()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.service_type = 'individual' THEN
          NEW.total_base := NEW.duracion_pactada_horas * NEW.precio_base_hora_pactado;
        END IF;
        NEW.total_final :=
          COALESCE(NEW.total_base, 0) +
          COALESCE(NEW.total_extras, 0) +
          COALESCE(NEW.customer_transport_charge, NEW.total_transporte, 0);
        IF NEW.service_type = 'grupal' THEN
          NEW.pending_balance := GREATEST(NEW.total_final - COALESCE(NEW.total_paid, 0), 0);
        ELSE
          NEW.pending_balance := 0;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION actualizar_total_participantes()
      RETURNS TRIGGER AS $$
      DECLARE v_service_id uuid;
      BEGIN
        v_service_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.service_id ELSE NEW.service_id END;
        UPDATE servicios
        SET total_base = (
          SELECT COALESCE(SUM(confirmed_subtotal), 0)
          FROM service_participants
          WHERE service_id = v_service_id AND status <> 'cancelada'
        )
        WHERE id = v_service_id AND service_type = 'grupal';
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER "trigger_actualizar_total_participantes"
        AFTER INSERT OR UPDATE OR DELETE ON "service_participants"
        FOR EACH ROW EXECUTE FUNCTION actualizar_total_participantes();

      CREATE OR REPLACE FUNCTION actualizar_total_pagos()
      RETURNS TRIGGER AS $$
      DECLARE v_service_id uuid;
      BEGIN
        v_service_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.service_id ELSE NEW.service_id END;
        UPDATE servicios
        SET total_paid = (
          SELECT COALESCE(SUM(amount), 0)
          FROM service_payments
          WHERE service_id = v_service_id AND status = 'aprobado'
        )
        WHERE id = v_service_id;
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER "trigger_actualizar_total_pagos"
        AFTER INSERT OR UPDATE OR DELETE ON "service_payments"
        FOR EACH ROW EXECUTE FUNCTION actualizar_total_pagos();

      UPDATE "servicios" SET "total_extras" = "total_extras";
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "trigger_actualizar_total_pagos" ON "service_payments";
      DROP FUNCTION IF EXISTS actualizar_total_pagos();
      DROP TRIGGER IF EXISTS "trigger_actualizar_total_participantes" ON "service_participants";
      DROP FUNCTION IF EXISTS actualizar_total_participantes();
      DROP INDEX IF EXISTS "uq_liquidation_records_service_employee";
      CREATE UNIQUE INDEX "uq_liquidation_records_service"
        ON "liquidation_records" ("service_id") WHERE "service_id" IS NOT NULL;
      DROP INDEX IF EXISTS "UQ_interaction_rating_service_direction_employee";
      CREATE UNIQUE INDEX "UQ_interaction_rating_service_direction"
        ON "interaction_ratings" ("direction", "service_id")
        WHERE "service_id" IS NOT NULL AND "trip_id" IS NULL;
      DROP TABLE IF EXISTS "trip_passengers";
      DROP INDEX IF EXISTS "idx_viajes_servicio_tipo_unidad_key";
      ALTER TABLE "viajes" DROP COLUMN IF EXISTS "unit_number";
      CREATE UNIQUE INDEX "viajes_servicio_id_tipo_key"
        ON "viajes" ("servicio_id", "tipo");
      DROP INDEX IF EXISTS "idx_service_extras_participant";
      ALTER TABLE "extras_servicio" DROP COLUMN IF EXISTS "participant_id";
      DROP INDEX IF EXISTS "idx_conversations_group_request";
      ALTER TABLE "conversaciones_telegram" DROP COLUMN IF EXISTS "group_request_id";
      DROP TABLE IF EXISTS "service_group_audit";
      DROP TABLE IF EXISTS "service_payments";
      DROP TABLE IF EXISTS "service_participants";
      DROP TABLE IF EXISTS "group_service_request_selections";
      DROP TABLE IF EXISTS "group_service_requests";
      ALTER TABLE "servicios"
        DROP CONSTRAINT IF EXISTS "CHK_servicios_service_type",
        DROP COLUMN IF EXISTS "pending_duration_hours",
        DROP COLUMN IF EXISTS "manual_transport_adjustment",
        DROP COLUMN IF EXISTS "transport_fee_snapshot",
        DROP COLUMN IF EXISTS "pending_balance",
        DROP COLUMN IF EXISTS "total_paid",
        DROP COLUMN IF EXISTS "service_type";
    `);
  }
}
