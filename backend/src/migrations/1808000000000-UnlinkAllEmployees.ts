import { MigrationInterface, QueryRunner } from 'typeorm';

export class UnlinkAllEmployees1808000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Unlink all empleadas
    await queryRunner.query(
      `UPDATE "usuarios" SET "telegram_chat_id" = NULL WHERE "rol" = 'empleada'`,
    );

    // Clear all telegram sessions to force a clean slate for the bots
    await queryRunner.query(`DELETE FROM "telegram_sessions"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Cannot restore unlinked data
  }
}
