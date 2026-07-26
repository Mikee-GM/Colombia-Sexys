import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCitasEncadenadas1783118800000 implements MigrationInterface {
  name = 'AddCitasEncadenadas1783118800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 4. Index for fast lookup of chained services by their predecessor
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_servicios_previo ON servicios (servicio_previo_id)
        WHERE servicio_previo_id IS NOT NULL;
    `);

    // ─────────────────────────────────────────────────────────────────────────
    // TRIGGER 1: When a service finalizes → activate all directly chained services
    //            (pendiente_encadenado → pendiente) and propagate recursively.
    // ─────────────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION activar_cadena_al_finalizar()
      RETURNS TRIGGER AS $$
      DECLARE
        v_encadenado RECORD;
      BEGIN
        -- Only react when the service transitions to 'finalizado'
        IF NEW.estado = 'finalizado' AND OLD.estado IS DISTINCT FROM 'finalizado' THEN
          FOR v_encadenado IN
            SELECT id, cliente_id
            FROM servicios
            WHERE servicio_previo_id = NEW.id
              AND estado = 'pendiente_encadenado'
            ORDER BY created_at ASC
          LOOP
            -- Activate this chained service: move it to regular 'pendiente'
            UPDATE servicios
            SET
              estado              = 'pendiente',
              hora_inicio_estimada = NEW.hora_fin_servicio,
              servicio_previo_id  = NULL   -- unlink from predecessor
            WHERE id = v_encadenado.id;

            -- Notify the app layer so it can send Telegram messages
            PERFORM pg_notify(
              'cadena_activada',
              json_build_object(
                'servicio_id',  v_encadenado.id,
                'cliente_id',   v_encadenado.cliente_id,
                'hora_inicio',  NEW.hora_fin_servicio
              )::text
            );
          END LOOP;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_activar_cadena_al_finalizar ON servicios;
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_activar_cadena_al_finalizar
      AFTER UPDATE OF estado ON servicios
      FOR EACH ROW
      EXECUTE FUNCTION activar_cadena_al_finalizar();
    `);

    // ─────────────────────────────────────────────────────────────────────────
    // TRIGGER 2: When duracion_pactada_horas changes (extension accepted) →
    //            recalculate hora_inicio_estimada for ALL services in the queue.
    //            Uses a recursive CTE to walk the chain.
    // ─────────────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION actualizar_estimacion_cadena()
      RETURNS TRIGGER AS $$
      DECLARE
        v_nueva_fin  TIMESTAMPTZ;
        v_encadenado RECORD;
      BEGIN
        -- Only act when the agreed duration actually changed and the service is active
        IF NEW.duracion_pactada_horas IS DISTINCT FROM OLD.duracion_pactada_horas
           AND NEW.estado = 'en_curso'
           AND NEW.hora_inicio_servicio IS NOT NULL
        THEN
          -- Calculate the new projected end time for this service
          v_nueva_fin := NEW.hora_inicio_servicio
                         + (NEW.duracion_pactada_horas || ' hours')::INTERVAL;

          -- Walk the chain: update every directly chained service
          FOR v_encadenado IN
            SELECT id, cliente_id, duracion_pactada_horas
            FROM servicios
            WHERE servicio_previo_id = NEW.id
              AND estado = 'pendiente_encadenado'
            ORDER BY created_at ASC
          LOOP
            UPDATE servicios
            SET hora_inicio_estimada = v_nueva_fin
            WHERE id = v_encadenado.id;

            -- Notify so the app can inform the waiting client
            PERFORM pg_notify(
              'estimacion_actualizada',
              json_build_object(
                'servicio_id',          v_encadenado.id,
                'cliente_id',           v_encadenado.cliente_id,
                'nueva_hora_estimada',  v_nueva_fin,
                'horas_agregadas',      NEW.duracion_pactada_horas - OLD.duracion_pactada_horas
              )::text
            );

            -- Advance the projected window for any further links in the chain
            v_nueva_fin := v_nueva_fin
                           + (v_encadenado.duracion_pactada_horas || ' hours')::INTERVAL;
          END LOOP;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_actualizar_estimacion_cadena ON servicios;
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_actualizar_estimacion_cadena
      AFTER UPDATE OF duracion_pactada_horas ON servicios
      FOR EACH ROW
      EXECUTE FUNCTION actualizar_estimacion_cadena();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Triggers & functions
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_actualizar_estimacion_cadena ON servicios;`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS actualizar_estimacion_cadena();`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_activar_cadena_al_finalizar ON servicios;`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS activar_cadena_al_finalizar();`,
    );

    // Index & columns
    await queryRunner.query(`DROP INDEX IF EXISTS idx_servicios_previo;`);
    await queryRunner.query(
      `ALTER TABLE servicios DROP COLUMN IF EXISTS hora_inicio_estimada;`,
    );
    await queryRunner.query(
      `ALTER TABLE servicios DROP COLUMN IF EXISTS servicio_previo_id;`,
    );

    // NOTE: PostgreSQL does not support removing enum values.
    // The 'pendiente_encadenado' value will remain in the enum after rollback.
    // Rows must be migrated away from this value before dropping is possible.
  }
}
