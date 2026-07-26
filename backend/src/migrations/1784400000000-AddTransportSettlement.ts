import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTransportSettlement1784400000000 implements MigrationInterface {
  name = 'AddTransportSettlement1784400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "servicios"
        ADD COLUMN "total_transporte" numeric(10,2) NOT NULL DEFAULT 0,
        ADD COLUMN "estado_liquidacion" character varying(30) NOT NULL DEFAULT 'cerrada',
        ADD COLUMN "telegram_resumen_provisional_id" character varying,
        ADD COLUMN "recordatorios_regreso" smallint NOT NULL DEFAULT 0,
        ADD COLUMN "proximo_recordatorio_regreso_at" TIMESTAMP WITH TIME ZONE;
    `);
    await queryRunner.query(`
      ALTER TABLE "viajes"
        ADD COLUMN "telegram_uber_file_id" character varying;
    `);
    await queryRunner.query(`
      ALTER TABLE "servicios"
        ADD CONSTRAINT "CHK_servicios_estado_liquidacion"
        CHECK (estado_liquidacion IN ('transporte_pendiente', 'cerrada'));
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION calcular_total_servicio()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.total_base := NEW.duracion_pactada_horas * NEW.precio_base_hora_pactado;
        NEW.total_final := NEW.total_base + COALESCE(NEW.total_transporte, 0);
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION actualizar_total_transporte_servicio()
      RETURNS TRIGGER AS $$
      DECLARE v_servicio_id UUID;
      BEGIN
        v_servicio_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.servicio_id ELSE NEW.servicio_id END;
        UPDATE servicios
        SET total_transporte = (
          SELECT COALESCE(SUM(tarifa), 0)
          FROM viajes
          WHERE servicio_id = v_servicio_id
            AND estado NOT IN ('cancelado', 'rechazado')
        )
        WHERE id = v_servicio_id;
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(`
      CREATE TRIGGER trigger_actualizar_total_transporte
      AFTER INSERT OR UPDATE OF tarifa, estado, servicio_id OR DELETE ON viajes
      FOR EACH ROW EXECUTE FUNCTION actualizar_total_transporte_servicio();
    `);
    await queryRunner.query(`
      UPDATE servicios s
      SET total_transporte = COALESCE((
        SELECT SUM(v.tarifa) FROM viajes v
        WHERE v.servicio_id = s.id
          AND v.estado NOT IN ('cancelado', 'rechazado')
      ), 0);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trigger_actualizar_total_transporte ON viajes`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS actualizar_total_transporte_servicio()`,
    );
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION calcular_total_servicio()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.total_base := NEW.duracion_pactada_horas * NEW.precio_base_hora_pactado;
        NEW.total_final := NEW.total_base;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await queryRunner.query(
      `ALTER TABLE "servicios" DROP CONSTRAINT "CHK_servicios_estado_liquidacion"`,
    );
    await queryRunner.query(
      `ALTER TABLE "viajes" DROP COLUMN "telegram_uber_file_id"`,
    );
    await queryRunner.query(`
      ALTER TABLE "servicios"
        DROP COLUMN "proximo_recordatorio_regreso_at",
        DROP COLUMN "recordatorios_regreso",
        DROP COLUMN "telegram_resumen_provisional_id",
        DROP COLUMN "estado_liquidacion",
        DROP COLUMN "total_transporte";
    `);
  }
}
