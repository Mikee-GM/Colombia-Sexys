import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dedicated source of truth for a customer pre-service booking.
 *
 * The backfill is intentionally conservative: only UUID booking ids already
 * present in the conversation history are copied. Ambiguous or malformed
 * legacy JSON remains readable through the compatibility fallback in the
 * conversation service and is never guessed into a new service.
 */
export class CreateCustomerBookingSessions1810000400000 implements MigrationInterface {
  name = 'CreateCustomerBookingSessions1810000400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "customer_booking_sessions" (
        "id" uuid PRIMARY KEY,
        "client_id" uuid NOT NULL,
        "intended_employee_id" uuid NULL,
        "owner_boss_id" uuid NULL,
        "status" varchar(32) NOT NULL DEFAULT 'COLLECTING',
        "duration_hours" numeric NULL,
        "open_ended_duration" boolean NOT NULL DEFAULT false,
        "place_type" varchar(24) NULL,
        "preset_location_id" uuid NULL,
        "location_name" varchar(160) NULL,
        "location_address" text NULL,
        "location_notes" text NULL,
        "location_lat" double precision NULL,
        "location_lng" double precision NULL,
        "room" varchar(80) NULL,
        "payment_method" varchar(24) NULL,
        "schedule_type" varchar(24) NOT NULL DEFAULT 'inmediato',
        "scheduled_at" timestamptz NULL,
        "current_requirement" varchar(48) NULL,
        "mode" varchar(16) NOT NULL DEFAULT 'AI_ACTIVE',
        "service_id" uuid NULL UNIQUE,
        "version" integer NOT NULL DEFAULT 1,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "last_interaction_at" timestamptz NOT NULL DEFAULT now(),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_customer_booking_sessions_client_status"
      ON "customer_booking_sessions" ("client_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_customer_booking_sessions_employee_status"
      ON "customer_booking_sessions" ("intended_employee_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_customer_booking_sessions_updated_at"
      ON "customer_booking_sessions" ("updated_at")
    `);
    await queryRunner.query(`
      INSERT INTO "customer_booking_sessions" (
        "id", "client_id", "intended_employee_id", "status", "mode",
        "service_id", "duration_hours", "open_ended_duration",
        "payment_method", "preset_location_id", "location_name",
        "location_address", "location_notes", "schedule_type",
        "location_lat", "location_lng", "room", "scheduled_at", "metadata", "last_interaction_at", "created_at",
        "updated_at", "current_requirement"
      )
      SELECT DISTINCT ON (conversation."booking_session_id")
        conversation."booking_session_id"::uuid,
        conversation."cliente_id",
        conversation."intended_employee_id",
        CASE WHEN conversation."servicio_id" IS NULL THEN 'COLLECTING' ELSE 'SERVICE_CREATED' END,
        CASE WHEN conversation."ia_activa" THEN 'AI_ACTIVE' ELSE 'HUMAN_ACTIVE' END,
        conversation."servicio_id",
        NULLIF(session.data->>'duracionPactadaHoras', '')::numeric,
        COALESCE((session.data->>'duracionIndefinida')::boolean, false),
        session.data->>'metodoPago',
        NULLIF(session.data->>'presetLocationId', '')::uuid,
        session.data->>'locationNameSnapshot',
        session.data->>'locationAddressSnapshot',
        session.data->>'locationNotas',
        COALESCE(session.data->>'tipoAgenda', 'inmediato'),
        NULLIF(session.data->>'locationLat', '')::double precision,
        NULLIF(session.data->>'locationLng', '')::double precision,
        session.data->>'room',
        NULLIF(session.data->>'fechaProgramada', '')::timestamptz,
        jsonb_build_object('legacy', true),
        conversation."enviado_at",
        conversation."enviado_at",
        conversation."enviado_at",
        session.data->>'step'
      FROM "conversaciones_telegram" conversation
      LEFT JOIN LATERAL (
        SELECT telegram_session.data
        FROM "telegram_sessions" telegram_session
        WHERE telegram_session.data->>'bookingSessionId' = conversation."booking_session_id"::text
        ORDER BY telegram_session."updated_at" DESC
        LIMIT 1
      ) session ON true
      WHERE conversation."booking_session_id" IS NOT NULL
        AND conversation."booking_session_id"::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      ORDER BY conversation."booking_session_id", conversation."enviado_at" DESC
      ON CONFLICT ("id") DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "idx_customer_booking_sessions_updated_at"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "idx_customer_booking_sessions_employee_status"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "idx_customer_booking_sessions_client_status"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "customer_booking_sessions"');
  }
}
