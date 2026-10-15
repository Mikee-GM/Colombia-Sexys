import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddConversationAttachments1810001000000 implements MigrationInterface {
  name = 'AddConversationAttachments1810001000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversaciones_telegram"
        ADD COLUMN IF NOT EXISTS "attachment" jsonb,
        ADD COLUMN IF NOT EXISTS "photo_file_id" text
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "conversaciones_telegram"
        DROP COLUMN IF EXISTS "photo_file_id",
        DROP COLUMN IF EXISTS "attachment"
    `);
  }
}
