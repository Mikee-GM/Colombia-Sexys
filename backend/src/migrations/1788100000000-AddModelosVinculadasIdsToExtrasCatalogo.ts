import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddModelosVinculadasIdsToExtrasCatalogo1788100000000
  implements MigrationInterface
{
  name = 'AddModelosVinculadasIdsToExtrasCatalogo1788100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "extras_catalogo"
      ADD COLUMN IF NOT EXISTS "modelos_vinculadas_ids" jsonb DEFAULT '[]'::jsonb;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "extras_catalogo"
      DROP COLUMN IF EXISTS "modelos_vinculadas_ids";
    `);
  }
}
