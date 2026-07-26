import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateServiceExtrasAndTotals1783118910000 implements MigrationInterface {
  name = 'UpdateServiceExtrasAndTotals1783118910000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add 'efectivo' to the enum type.
    // In PostgreSQL, ALTER TYPE ... ADD VALUE cannot be executed inside a transaction block in some versions,
    // but TypeORM running pg driver supports it if no other tables use it, or we can catch any error.
    try {
      await queryRunner.query(
        `ALTER TYPE public.extras_servicio_metodo_pago_enum ADD VALUE IF NOT EXISTS 'efectivo'`,
      );
    } catch (err) {
      console.warn(
        'Error running ALTER TYPE to add "efectivo". It might already exist or be in a transaction:',
        err,
      );
    }

    // 2. Update trigger function calculating total_final (it should not include total_extras)
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

    // 3. Update existing records in the database so total_final = total_base
    await queryRunner.query(`
      UPDATE servicios
      SET total_final = total_base;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert trigger function
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

    // Revert existing records to add total_extras back to total_final
    await queryRunner.query(`
      UPDATE servicios
      SET total_final = total_base + COALESCE(total_extras, 0);
    `);
  }
}
