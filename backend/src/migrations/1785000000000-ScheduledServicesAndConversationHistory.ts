import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScheduledServicesAndConversationHistory1785000000000 implements MigrationInterface {
  name = 'ScheduledServicesAndConversationHistory1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop triggers temporarily so PostgreSQL allows altering the column type of 'servicios'
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trigger_calcular_total_servicio ON servicios;`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trigger_actualizar_metricas_empleada ON servicios;`,
    );

    await queryRunner.query(
      `ALTER TYPE servicios_estado_enum RENAME TO servicios_estado_enum_before_schedule`,
    );
    await queryRunner.query(
      `CREATE TYPE servicios_estado_enum AS ENUM ('pendiente', 'agendado', 'en_curso', 'finalizado', 'cancelado')`,
    );
    await queryRunner.query(
      `ALTER TABLE servicios ALTER COLUMN estado DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE servicios ALTER COLUMN estado TYPE servicios_estado_enum USING estado::text::servicios_estado_enum`,
    );
    await queryRunner.query(
      `ALTER TABLE servicios ALTER COLUMN estado SET DEFAULT 'pendiente'`,
    );
    await queryRunner.query(`DROP TYPE servicios_estado_enum_before_schedule`);

    // Recreate triggers on servicios
    await queryRunner.query(`
      CREATE TRIGGER trigger_calcular_total_servicio
      BEFORE INSERT OR UPDATE ON servicios
      FOR EACH ROW
      EXECUTE FUNCTION calcular_total_servicio();
    `);
    await queryRunner.query(`
      CREATE TRIGGER trigger_actualizar_metricas_empleada
      AFTER INSERT OR DELETE OR UPDATE OF calificacion, estado, empleada_id ON servicios
      FOR EACH ROW
      EXECUTE FUNCTION actualizar_metricas_empleada_desde_servicio();
    `);

    await queryRunner.query(
      `ALTER TABLE servicios ADD COLUMN servicio_previo_id uuid REFERENCES servicios(id) ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE servicios ADD COLUMN hora_disponibilidad_estimada timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE servicios ADD COLUMN hora_inicio_estimada timestamptz`,
    );
    await queryRunner.query(`ALTER TABLE servicios ADD COLUMN notas_jefe text`);
    await queryRunner.query(
      `ALTER TABLE servicios ADD COLUMN transporte_agendado varchar(10)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_servicio_siguiente_por_empleada ON servicios (empleada_id) WHERE estado IN ('pendiente', 'agendado') AND servicio_previo_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_servicios_previo ON servicios (servicio_previo_id) WHERE servicio_previo_id IS NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TYPE conversaciones_telegram_emisor_enum RENAME TO conversaciones_telegram_emisor_enum_before_system`,
    );
    await queryRunner.query(
      `CREATE TYPE conversaciones_telegram_emisor_enum AS ENUM ('ia', 'jefe', 'cliente', 'sistema')`,
    );
    await queryRunner.query(
      `ALTER TABLE conversaciones_telegram ALTER COLUMN emisor TYPE conversaciones_telegram_emisor_enum USING emisor::text::conversaciones_telegram_emisor_enum`,
    );
    await queryRunner.query(
      `DROP TYPE conversaciones_telegram_emisor_enum_before_system`,
    );
    await queryRunner.query(
      `ALTER TABLE conversaciones_telegram ADD COLUMN booking_session_id uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_conversaciones_booking_session ON conversaciones_telegram (booking_session_id, enviado_at) WHERE booking_session_id IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS idx_conversaciones_booking_session`,
    );
    await queryRunner.query(
      `DELETE FROM conversaciones_telegram WHERE emisor = 'sistema'`,
    );
    await queryRunner.query(
      `ALTER TABLE conversaciones_telegram DROP COLUMN IF EXISTS booking_session_id`,
    );
    await queryRunner.query(
      `ALTER TYPE conversaciones_telegram_emisor_enum RENAME TO conversaciones_telegram_emisor_enum_with_system`,
    );
    await queryRunner.query(
      `CREATE TYPE conversaciones_telegram_emisor_enum AS ENUM ('ia', 'jefe', 'cliente')`,
    );
    await queryRunner.query(
      `ALTER TABLE conversaciones_telegram ALTER COLUMN emisor TYPE conversaciones_telegram_emisor_enum USING emisor::text::conversaciones_telegram_emisor_enum`,
    );
    await queryRunner.query(
      `DROP TYPE conversaciones_telegram_emisor_enum_with_system`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_servicios_previo`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS uq_servicio_siguiente_por_empleada`,
    );
    await queryRunner.query(
      `UPDATE servicios SET estado = 'cancelado' WHERE estado = 'agendado'`,
    );
    await queryRunner.query(
      `ALTER TABLE servicios DROP COLUMN IF EXISTS transporte_agendado`,
    );
    await queryRunner.query(
      `ALTER TABLE servicios DROP COLUMN IF EXISTS notas_jefe`,
    );
    await queryRunner.query(
      `ALTER TABLE servicios DROP COLUMN IF EXISTS hora_inicio_estimada`,
    );
    await queryRunner.query(
      `ALTER TABLE servicios DROP COLUMN IF EXISTS hora_disponibilidad_estimada`,
    );
    await queryRunner.query(
      `ALTER TABLE servicios DROP COLUMN IF EXISTS servicio_previo_id`,
    );
    // Note: PostgreSQL ENUM values cannot be easily removed without dropping dependent columns/triggers.
    // Setting any 'agendado' state to 'cancelado' is sufficient for rollback.
  }
}
