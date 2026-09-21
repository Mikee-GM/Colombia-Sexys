import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Agrega admin_topic_id a clientes.
 *
 * Guarda el thread ID del tema creado en el supergrupo del Super Admin
 * para que el bot sepa dónde publicar los mensajes de cada cliente.
 */
export class AddAdminTopicId1805000000000 implements MigrationInterface {
  name = 'AddAdminTopicId1805000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clientes"
      ADD COLUMN IF NOT EXISTS "admin_topic_id" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "clientes" DROP COLUMN IF EXISTS "admin_topic_id"`,
    );
  }
}
