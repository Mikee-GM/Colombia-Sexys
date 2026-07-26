import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmployeeRatingMetrics1784401000000 implements MigrationInterface {
  name = 'AddEmployeeRatingMetrics1784401000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "empleadas"
        ADD COLUMN "total_servicios_valorados" integer NOT NULL DEFAULT 0,
        ADD COLUMN "promedio_calificacion" numeric(3,2);
    `);

    await queryRunner.query(`
      ALTER TABLE "servicios"
        ADD CONSTRAINT "CHK_servicios_calificacion"
        CHECK (calificacion IS NULL OR calificacion BETWEEN 1 AND 5);
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION recalcular_metricas_empleada(p_empleada_id UUID)
      RETURNS void AS $$
      BEGIN
        IF p_empleada_id IS NULL THEN
          RETURN;
        END IF;

        UPDATE empleadas e
        SET
          total_servicios_valorados = metricas.total,
          promedio_calificacion = metricas.promedio
        FROM (
          SELECT
            COUNT(*)::integer AS total,
            AVG(s.calificacion)::numeric(3,2) AS promedio
          FROM servicios s
          WHERE s.empleada_id = p_empleada_id
            AND s.estado = 'finalizado'
            AND s.calificacion BETWEEN 1 AND 5
        ) metricas
        WHERE e.id = p_empleada_id;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION actualizar_metricas_empleada_desde_servicio()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN
          PERFORM recalcular_metricas_empleada(OLD.empleada_id);
          RETURN OLD;
        END IF;

        IF TG_OP = 'UPDATE' AND OLD.empleada_id IS DISTINCT FROM NEW.empleada_id THEN
          PERFORM recalcular_metricas_empleada(OLD.empleada_id);
        END IF;

        PERFORM recalcular_metricas_empleada(NEW.empleada_id);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE TRIGGER trigger_actualizar_metricas_empleada
      AFTER INSERT OR DELETE OR UPDATE OF calificacion, estado, empleada_id ON servicios
      FOR EACH ROW
      EXECUTE FUNCTION actualizar_metricas_empleada_desde_servicio();
    `);

    await queryRunner.query(`
      UPDATE empleadas e
      SET
        total_servicios_valorados = metricas.total,
        promedio_calificacion = metricas.promedio
      FROM (
        SELECT
          e2.id AS empleada_id,
          COUNT(s.id)::integer AS total,
          AVG(s.calificacion)::numeric(3,2) AS promedio
        FROM empleadas e2
        LEFT JOIN servicios s
          ON s.empleada_id = e2.id
          AND s.estado = 'finalizado'
          AND s.calificacion BETWEEN 1 AND 5
        GROUP BY e2.id
      ) metricas
      WHERE e.id = metricas.empleada_id;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trigger_actualizar_metricas_empleada ON servicios`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS actualizar_metricas_empleada_desde_servicio()`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS recalcular_metricas_empleada(UUID)`,
    );
    await queryRunner.query(
      `ALTER TABLE "servicios" DROP CONSTRAINT IF EXISTS "CHK_servicios_calificacion"`,
    );
    await queryRunner.query(`
      ALTER TABLE "empleadas"
        DROP COLUMN "promedio_calificacion",
        DROP COLUMN "total_servicios_valorados";
    `);
  }
}
