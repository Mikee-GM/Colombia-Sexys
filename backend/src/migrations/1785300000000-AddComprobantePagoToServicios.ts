import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddComprobantePagoToServicios1785300000000 implements MigrationInterface {
  name = 'AddComprobantePagoToServicios1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "servicios" ADD "comprobante_pago_file_id" character varying(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "servicios" DROP COLUMN "comprobante_pago_file_id"`,
    );
  }
}
