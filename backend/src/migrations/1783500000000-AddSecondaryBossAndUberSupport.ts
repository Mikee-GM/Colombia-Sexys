import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSecondaryBossAndUberSupport1783500000000 implements MigrationInterface {
  name = 'AddSecondaryBossAndUberSupport1783500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add disponible to usuarios
    await queryRunner.query(`
      ALTER TABLE "usuarios"
      ADD COLUMN "disponible" boolean NOT NULL DEFAULT true;
    `);

    // 2. Add jefe_secundario_id to empleadas with foreign key
    await queryRunner.query(`
      ALTER TABLE "empleadas"
      ADD COLUMN "jefe_secundario_id" uuid,
      ADD CONSTRAINT "FK_empleadas_jefe_secundario" FOREIGN KEY ("jefe_secundario_id") REFERENCES "usuarios" ("id") ON DELETE SET NULL ON UPDATE NO ACTION;
    `);

    // 3. Add proveedor_transporte to viajes
    await queryRunner.query(`
      ALTER TABLE "viajes"
      ADD COLUMN "proveedor_transporte" character varying(50) NOT NULL DEFAULT 'interno';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop constraints and columns
    await queryRunner.query(`
      ALTER TABLE "viajes"
      DROP COLUMN "proveedor_transporte";
    `);

    await queryRunner.query(`
      ALTER TABLE "empleadas"
      DROP CONSTRAINT "FK_empleadas_jefe_secundario",
      DROP COLUMN "jefe_secundario_id";
    `);

    await queryRunner.query(`
      ALTER TABLE "usuarios"
      DROP COLUMN "disponible";
    `);
  }
}
