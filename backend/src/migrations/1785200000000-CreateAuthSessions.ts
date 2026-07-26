import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuthSessions1785200000000 implements MigrationInterface {
  name = 'CreateAuthSessions1785200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "auth_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "family_id" uuid NOT NULL,
        "device_id" varchar(128) NOT NULL,
        "refresh_token_hash" char(64) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "revoked_at" timestamptz,
        "replaced_by_session_id" uuid,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_auth_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_auth_sessions_user"
          FOREIGN KEY ("user_id") REFERENCES "usuarios"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_auth_sessions_user_id" ON "auth_sessions" ("user_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_auth_sessions_family_id" ON "auth_sessions" ("family_id")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "auth_sessions"');
  }
}
