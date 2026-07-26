import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSequentialTripStatus1784402000000 implements MigrationInterface {
  name = 'AddSequentialTripStatus1784402000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."viajes_estado_enum" ADD VALUE IF NOT EXISTS 'en_camino' AFTER 'aceptado'`,
    );
    await queryRunner.query(
      `ALTER TABLE "servicios" RENAME COLUMN "telegram_resumen_provisional_id" TO "telegram_resumen_definitivo_id"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "servicios" RENAME COLUMN "telegram_resumen_definitivo_id" TO "telegram_resumen_provisional_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "viajes" ALTER COLUMN "estado" DROP DEFAULT`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."viajes_estado_enum_old" AS ENUM('notificado', 'aceptado', 'llegado', 'en_curso', 'finalizado', 'rechazado', 'cancelado')`,
    );
    await queryRunner.query(
      `ALTER TABLE "viajes" ALTER COLUMN "estado" TYPE "public"."viajes_estado_enum_old" USING (CASE WHEN "estado"::text = 'en_camino' THEN 'aceptado' ELSE "estado"::text END)::"public"."viajes_estado_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."viajes_estado_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."viajes_estado_enum_old" RENAME TO "viajes_estado_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "viajes" ALTER COLUMN "estado" SET DEFAULT 'notificado'`,
    );
  }
}
