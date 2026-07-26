import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDisciplineSystem1785100000000
  implements MigrationInterface
{
  name = 'CreateDisciplineSystem1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "interaction_ratings_direction_enum" AS ENUM(
        'client_to_employee', 'employee_to_client',
        'driver_to_employee', 'employee_to_driver'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "conduct_reports_category_enum" AS ENUM(
        'trato_inadecuado', 'demora_impuntualidad', 'incumplimiento',
        'cobro', 'seguridad', 'otro'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "interaction_ratings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "direction" "interaction_ratings_direction_enum" NOT NULL,
        "service_id" uuid,
        "trip_id" uuid,
        "client_id" uuid,
        "employee_id" uuid,
        "driver_id" uuid,
        "stars" smallint NOT NULL,
        "comment" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_interaction_ratings" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_interaction_ratings_stars" CHECK ("stars" BETWEEN 1 AND 5),
        CONSTRAINT "CHK_interaction_ratings_reference" CHECK (
          ("service_id" IS NOT NULL AND "trip_id" IS NULL
            AND "direction" IN ('client_to_employee', 'employee_to_client'))
          OR
          ("service_id" IS NOT NULL AND "trip_id" IS NOT NULL
            AND "direction" IN ('driver_to_employee', 'employee_to_driver'))
        ),
        CONSTRAINT "FK_interaction_ratings_service" FOREIGN KEY ("service_id")
          REFERENCES "servicios"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_interaction_ratings_trip" FOREIGN KEY ("trip_id")
          REFERENCES "viajes"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_interaction_ratings_client" FOREIGN KEY ("client_id")
          REFERENCES "clientes"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_interaction_ratings_employee" FOREIGN KEY ("employee_id")
          REFERENCES "empleadas"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_interaction_ratings_driver" FOREIGN KEY ("driver_id")
          REFERENCES "choferes"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_interaction_rating_service_direction"
      ON "interaction_ratings" ("direction", "service_id")
      WHERE "service_id" IS NOT NULL AND "trip_id" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_interaction_rating_trip_direction"
      ON "interaction_ratings" ("direction", "trip_id")
      WHERE "trip_id" IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_interaction_rating_employee_direction"
      ON "interaction_ratings" ("employee_id", "direction")
    `);

    await queryRunner.query(`
      CREATE TABLE "conduct_reports" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "direction" "interaction_ratings_direction_enum" NOT NULL,
        "reporter_type" varchar(20) NOT NULL,
        "reporter_id" uuid NOT NULL,
        "subject_type" varchar(20) NOT NULL,
        "subject_id" uuid NOT NULL,
        "service_id" uuid,
        "trip_id" uuid,
        "category" "conduct_reports_category_enum" NOT NULL,
        "description" text NOT NULL,
        "priority" varchar(12) NOT NULL DEFAULT 'normal',
        "status" varchar(20) NOT NULL DEFAULT 'nuevo',
        "outcome" varchar(20),
        "assigned_admin_id" uuid,
        "resolution" text,
        "history" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conduct_reports" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_conduct_reports_people" CHECK (
          "reporter_type" IN ('client','employee','driver')
          AND "subject_type" IN ('client','employee','driver')
          AND "reporter_type" <> "subject_type"
        ),
        CONSTRAINT "CHK_conduct_reports_priority" CHECK (
          "priority" IN ('normal','alta','urgente')
        ),
        CONSTRAINT "CHK_conduct_reports_status" CHECK (
          "status" IN ('nuevo','en_revision','cerrado')
        ),
        CONSTRAINT "CHK_conduct_reports_outcome" CHECK (
          ("status" = 'cerrado' AND "outcome" IN ('confirmado','no_sustentado'))
          OR ("status" <> 'cerrado' AND "outcome" IS NULL)
        ),
        CONSTRAINT "FK_conduct_reports_service" FOREIGN KEY ("service_id")
          REFERENCES "servicios"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_conduct_reports_trip" FOREIGN KEY ("trip_id")
          REFERENCES "viajes"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_conduct_reports_admin" FOREIGN KEY ("assigned_admin_id")
          REFERENCES "usuarios"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_conduct_reports_subject_created"
      ON "conduct_reports" ("subject_type", "subject_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_conduct_report_interaction_category"
      ON "conduct_reports" (
        "direction", COALESCE("trip_id", "service_id"), "reporter_id", "category"
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "disciplinary_sanctions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "subject_type" varchar(20) NOT NULL,
        "subject_id" uuid NOT NULL,
        "type" varchar(20) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "reason" text NOT NULL,
        "conduct_report_id" uuid,
        "created_by_user_id" uuid NOT NULL,
        "starts_at" timestamptz NOT NULL DEFAULT now(),
        "ends_at" timestamptz,
        "revoked_by_user_id" uuid,
        "revoked_at" timestamptz,
        "revocation_reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_disciplinary_sanctions" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_disciplinary_sanctions_subject" CHECK (
          "subject_type" IN ('client','employee','driver')
        ),
        CONSTRAINT "CHK_disciplinary_sanctions_type" CHECK (
          "type" IN ('suspension','permanent_ban')
        ),
        CONSTRAINT "CHK_disciplinary_sanctions_status" CHECK (
          "status" IN ('active','revoked','expired')
        ),
        CONSTRAINT "CHK_disciplinary_sanctions_dates" CHECK (
          ("type" = 'suspension' AND "ends_at" IS NOT NULL AND "ends_at" > "starts_at")
          OR ("type" = 'permanent_ban' AND "ends_at" IS NULL)
        ),
        CONSTRAINT "FK_disciplinary_sanctions_report" FOREIGN KEY ("conduct_report_id")
          REFERENCES "conduct_reports"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_disciplinary_sanctions_creator" FOREIGN KEY ("created_by_user_id")
          REFERENCES "usuarios"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_disciplinary_sanctions_revoker" FOREIGN KEY ("revoked_by_user_id")
          REFERENCES "usuarios"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_disciplinary_sanctions_subject_status"
      ON "disciplinary_sanctions" ("subject_type", "subject_id", "status")
    `);

    await queryRunner.query(`
      INSERT INTO "interaction_ratings" (
        "direction", "service_id", "client_id", "employee_id",
        "stars", "comment", "created_at"
      )
      SELECT 'client_to_employee', s.id, s.cliente_id, s.empleada_id,
             s.calificacion, s.comentarios_calificacion, COALESCE(s.hora_fin_servicio, s.updated_at)
      FROM servicios s
      WHERE s.calificacion BETWEEN 1 AND 5
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "conduct_reports" (
        "direction", "reporter_type", "reporter_id", "subject_type", "subject_id",
        "service_id", "category", "description", "priority", "status", "outcome",
        "assigned_admin_id", "resolution", "history", "created_at", "updated_at"
      )
      SELECT
        CASE WHEN r.origin = 'cliente'
          THEN 'client_to_employee'::interaction_ratings_direction_enum
          ELSE 'driver_to_employee'::interaction_ratings_direction_enum END,
        CASE WHEN r.origin = 'cliente' THEN 'client' ELSE 'driver' END,
        COALESCE(r.client_id, r.driver_id),
        'employee', r.employee_id, r.service_id,
        r.category::text::conduct_reports_category_enum,
        r.description, r.priority::text,
        CASE WHEN r.status IN ('resuelto','descartado') THEN 'cerrado' ELSE r.status::text END,
        CASE WHEN r.status = 'resuelto' THEN 'confirmado'
             WHEN r.status = 'descartado' THEN 'no_sustentado' END,
        r.assigned_admin_id, r.resolution,
        jsonb_build_array(jsonb_build_object(
          'at', r.created_at, 'action', 'migrated',
          'source', 'employee_reports', 'sourceId', r.id
        )),
        r.created_at, r.updated_at
      FROM employee_reports r
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trigger_actualizar_metricas_empleada ON servicios
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION recalcular_metricas_empleada(p_empleada_id UUID)
      RETURNS void AS $$
      BEGIN
        IF p_empleada_id IS NULL THEN RETURN; END IF;
        UPDATE empleadas e
        SET total_servicios_valorados = metrics.total,
            promedio_calificacion = metrics.average
        FROM (
          SELECT COUNT(*)::integer AS total,
                 AVG(stars)::numeric(3,2) AS average
          FROM interaction_ratings
          WHERE employee_id = p_empleada_id
            AND direction = 'client_to_employee'
        ) metrics
        WHERE e.id = p_empleada_id;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION actualizar_metricas_empleada_desde_rating()
      RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          PERFORM recalcular_metricas_empleada(OLD.employee_id);
          RETURN OLD;
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.employee_id IS DISTINCT FROM NEW.employee_id THEN
          PERFORM recalcular_metricas_empleada(OLD.employee_id);
        END IF;
        PERFORM recalcular_metricas_empleada(NEW.employee_id);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trigger_actualizar_metricas_empleada_rating
      AFTER INSERT OR DELETE OR UPDATE OF stars, direction, employee_id
      ON interaction_ratings FOR EACH ROW
      EXECUTE FUNCTION actualizar_metricas_empleada_desde_rating()
    `);
    await queryRunner.query(`
      UPDATE empleadas e SET
        total_servicios_valorados = (
          SELECT COUNT(*)::integer FROM interaction_ratings r
          WHERE r.employee_id = e.id AND r.direction = 'client_to_employee'
        ),
        promedio_calificacion = (
          SELECT AVG(r.stars)::numeric(3,2) FROM interaction_ratings r
          WHERE r.employee_id = e.id AND r.direction = 'client_to_employee'
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trigger_actualizar_metricas_empleada_rating ON interaction_ratings`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS actualizar_metricas_empleada_desde_rating()`,
    );
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION recalcular_metricas_empleada(p_empleada_id UUID)
      RETURNS void AS $$
      BEGIN
        IF p_empleada_id IS NULL THEN RETURN; END IF;
        UPDATE empleadas e SET
          total_servicios_valorados = metrics.total,
          promedio_calificacion = metrics.average
        FROM (
          SELECT COUNT(*)::integer total, AVG(calificacion)::numeric(3,2) average
          FROM servicios
          WHERE empleada_id = p_empleada_id AND estado = 'finalizado'
            AND calificacion BETWEEN 1 AND 5
        ) metrics WHERE e.id = p_empleada_id;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION actualizar_metricas_empleada_desde_servicio()
      RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          PERFORM recalcular_metricas_empleada(OLD.empleada_id); RETURN OLD;
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.empleada_id IS DISTINCT FROM NEW.empleada_id THEN
          PERFORM recalcular_metricas_empleada(OLD.empleada_id);
        END IF;
        PERFORM recalcular_metricas_empleada(NEW.empleada_id); RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trigger_actualizar_metricas_empleada
      AFTER INSERT OR DELETE OR UPDATE OF calificacion, estado, empleada_id
      ON servicios FOR EACH ROW
      EXECUTE FUNCTION actualizar_metricas_empleada_desde_servicio()
    `);
    await queryRunner.query(`DROP TABLE "disciplinary_sanctions"`);
    await queryRunner.query(`DROP TABLE "conduct_reports"`);
    await queryRunner.query(`DROP TABLE "interaction_ratings"`);
    await queryRunner.query(`DROP TYPE "conduct_reports_category_enum"`);
    await queryRunner.query(`DROP TYPE "interaction_ratings_direction_enum"`);
  }
}
