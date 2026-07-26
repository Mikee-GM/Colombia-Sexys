import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemoveCitasEncadenadas1784329200000
  implements MigrationInterface
{
  name = 'RemoveCitasEncadenadas1784329200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_actualizar_estimacion_cadena ON servicios`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS actualizar_estimacion_cadena()`,
    );
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_activar_cadena_al_finalizar ON servicios`,
    );
    await queryRunner.query(
      `DROP FUNCTION IF EXISTS activar_cadena_al_finalizar()`,
    );
    await queryRunner.query(
      `UPDATE servicios SET estado = 'cancelado' WHERE estado = 'pendiente_encadenado'`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS idx_servicios_previo`);
    await queryRunner.query(
      `ALTER TABLE servicios DROP COLUMN IF EXISTS hora_inicio_estimada`,
    );
    await queryRunner.query(
      `ALTER TABLE servicios DROP COLUMN IF EXISTS servicio_previo_id`,
    );
    await queryRunner.query(
      `ALTER TYPE servicios_estado_enum RENAME TO servicios_estado_enum_old`,
    );
    await queryRunner.query(
      `CREATE TYPE servicios_estado_enum AS ENUM ('pendiente', 'en_curso', 'finalizado', 'cancelado')`,
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
    await queryRunner.query(`DROP TYPE servicios_estado_enum_old`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE servicios_estado_enum ADD VALUE IF NOT EXISTS 'pendiente_encadenado'`,
    );
    await queryRunner.query(
      `ALTER TABLE servicios ADD COLUMN IF NOT EXISTS servicio_previo_id uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE servicios ADD COLUMN IF NOT EXISTS hora_inicio_estimada timestamptz`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS idx_servicios_previo ON servicios (servicio_previo_id) WHERE servicio_previo_id IS NOT NULL`,
    );
  }
}
