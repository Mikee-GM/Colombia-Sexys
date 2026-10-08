import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddManualLocationConfirmation1810000500000 implements MigrationInterface {
  name = 'AddManualLocationConfirmation1810000500000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer_booking_sessions"
      ADD COLUMN IF NOT EXISTS "manual_location_confirmed" boolean NOT NULL DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "customer_booking_sessions"
      DROP COLUMN IF EXISTS "manual_location_confirmed"
    `);
  }
}
