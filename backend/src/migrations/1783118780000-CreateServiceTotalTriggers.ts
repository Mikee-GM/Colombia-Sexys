import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateServiceTotalTriggers1783118780000 implements MigrationInterface {
  name = 'CreateServiceTotalTriggers1783118780000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create function to calculate total_base and total_final on servicios
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION calcular_total_servicio()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.total_base := NEW.duracion_pactada_horas * NEW.precio_base_hora_pactado;
          NEW.total_final := NEW.total_base + COALESCE(NEW.total_extras, 0);
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 2. Create trigger on servicios
    await queryRunner.query(`
      CREATE TRIGGER trigger_calcular_total_servicio
      BEFORE INSERT OR UPDATE ON servicios
      FOR EACH ROW
      EXECUTE FUNCTION calcular_total_servicio();
    `);

    // 3. Create function to update total_extras on servicios when extras_servicio changes
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION actualizar_total_extras_servicio()
      RETURNS TRIGGER AS $$
      DECLARE
          v_servicio_id UUID;
          v_total_extras NUMERIC(10,2);
      BEGIN
          IF TG_OP = 'DELETE' THEN
              v_servicio_id := OLD.servicio_id;
          ELSE
              v_servicio_id := NEW.servicio_id;
          END IF;

          SELECT COALESCE(SUM(precio_cobrado), 0)
          INTO v_total_extras
          FROM extras_servicio
          WHERE servicio_id = v_servicio_id;

          UPDATE servicios
          SET total_extras = v_total_extras
          WHERE id = v_servicio_id;

          IF TG_OP = 'DELETE' THEN
              RETURN OLD;
          ELSE
              RETURN NEW;
          END IF;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 4. Create trigger on extras_servicio
    await queryRunner.query(`
      CREATE TRIGGER trigger_actualizar_total_extras_servicio
      AFTER INSERT OR UPDATE OR DELETE ON extras_servicio
      FOR EACH ROW
      EXECUTE FUNCTION actualizar_total_extras_servicio();
    `);

    // 5. Update existing records in the database so that their total_base and total_final are calculated
    await queryRunner.query(`
      UPDATE servicios
      SET total_base = duracion_pactada_horas * precio_base_hora_pactado,
          total_final = (duracion_pactada_horas * precio_base_hora_pactado) + COALESCE(total_extras, 0);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trigger_actualizar_total_extras_servicio ON extras_servicio;`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS actualizar_total_extras_servicio();`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trigger_calcular_total_servicio ON servicios;`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS calcular_total_servicio();`,
    );
  }
}
