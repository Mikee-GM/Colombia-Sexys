import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCoupleSpeechAndOpenEndedServices1789100000000 implements MigrationInterface {
  name = 'AddCoupleSpeechAndOpenEndedServices1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Speech personalizado para extras (usado principalmente por "Atención a parejas").
    await queryRunner.query(`
      ALTER TABLE "extras_catalogo"
      ADD COLUMN IF NOT EXISTS "speech_personalizado" text;
    `);

    // Servicios con duración indefinida: las horas se cuentan al finalizar.
    await queryRunner.query(`
      ALTER TABLE "servicios"
      ADD COLUMN IF NOT EXISTS "duracion_indefinida" boolean NOT NULL DEFAULT false;
    `);

    // Cobro pendiente de comprobante al cierre de un servicio indefinido.
    await queryRunner.query(`
      ALTER TABLE "servicios"
      ADD COLUMN IF NOT EXISTS "cobro_final_pendiente" boolean NOT NULL DEFAULT false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "servicios"
      DROP COLUMN IF EXISTS "cobro_final_pendiente";
    `);
    await queryRunner.query(`
      ALTER TABLE "servicios"
      DROP COLUMN IF EXISTS "duracion_indefinida";
    `);
    await queryRunner.query(`
      ALTER TABLE "extras_catalogo"
      DROP COLUMN IF EXISTS "speech_personalizado";
    `);
  }
}
