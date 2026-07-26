import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentReceiptValidations1785400000000 implements MigrationInterface {
  name = 'AddPaymentReceiptValidations1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Initial insert of authorized bank accounts from spreadsheet
    const initialAccounts = [
      {
        banco: 'Azteca',
        titular: 'Ricardo Casanova',
        cuenta: '127041021055955733',
        ultimos4: '5733',
        clabe: null,
        alias: 'Azteca Pipe',
      },
      {
        banco: 'Banco Azteca',
        titular: 'Omar Pérez',
        cuenta: '4027660015577374',
        ultimos4: '7374',
        clabe: null,
        alias: 'Azteca Laura',
      },
      {
        banco: 'BBVA',
        titular: 'Omar Pérez',
        cuenta: '4152310215839576161',
        ultimos4: '1600',
        clabe: '012180015839576161',
        alias: 'BBVA Carlos',
      },
      {
        banco: 'BanCoppel',
        titular: 'Omar Pérez',
        cuenta: '4169161461866393',
        ultimos4: '6393',
        clabe: null,
        alias: 'BanCoppel Carlos',
      },
      {
        banco: 'BBVA',
        titular: 'Omar Pérez',
        cuenta: '4152314214309919',
        ultimos4: '9919',
        clabe: null,
        alias: 'BBVA Carlos 2',
      },
      {
        banco: 'BBVA',
        titular: 'Cesar de Jesus Nuñez Rodriguez',
        cuenta: '4152314216086598',
        ultimos4: '6598',
        clabe: '012180015058525469',
        alias: 'BBVA Cesar',
      },
      {
        banco: 'BBVA BANCOMER',
        titular: 'Bryan Michel Gonzalez C',
        cuenta: '4152314210686598',
        ultimos4: '6598',
        clabe: null,
        alias: null,
      },
      {
        banco: 'BBVA MEXICO',
        titular: 'CESAR DE JESUS NUNEZ RODRIGUEZ',
        cuenta: null,
        ultimos4: '5469',
        clabe: null,
        alias: null,
      },
      {
        banco: 'Azteca',
        titular: 'Omar Perez Perez',
        cuenta: null,
        ultimos4: '0374',
        clabe: null,
        alias: null,
      },
    ];
    await queryRunner.query(`
            CREATE TABLE "authorized_bank_accounts" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "banco" character varying(100) NOT NULL,
                "titular" character varying(255) NOT NULL,
                "cuenta" character varying(50),
                "ultimos4" character varying(4),
                "clabe" character varying(18),
                "alias" character varying(100),
                "activa" boolean NOT NULL DEFAULT true,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_authorized_bank_accounts" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            CREATE TABLE "payment_receipt_validations" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "fecha_recepcion" date,
                "hora_recepcion" character varying(10),
                "cliente_telegram" character varying(255),
                "chat_id" character varying(50),
                "es_comprobante" boolean NOT NULL DEFAULT false,
                "banco_origen" character varying(100),
                "banco_destino" character varying(100),
                "titular_destino" character varying(255),
                "cuenta_destino" character varying(50),
                "clabe" character varying(18),
                "monto" numeric(10,2),
                "fecha_transferencia" character varying(50),
                "hora_transferencia" character varying(20),
                "referencia" character varying(50),
                "folio" character varying(50),
                "id_spei" character varying(100),
                "concepto" character varying(255),
                "confianza" integer,
                "estado" character varying(50),
                "observaciones" text,
                "json_ia" jsonb,
                "servicio_id" uuid,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_payment_receipt_validations" PRIMARY KEY ("id")
            )
        `);
    await queryRunner.query(`
            ALTER TABLE "payment_receipt_validations"
            ADD CONSTRAINT "FK_payment_receipt_validations_servicio_id" FOREIGN KEY ("servicio_id") REFERENCES "servicios"("id") ON DELETE SET NULL ON UPDATE NO ACTION
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payment_receipt_validations" DROP CONSTRAINT "FK_payment_receipt_validations_servicio_id"`,
    );
    await queryRunner.query(`DROP TABLE "payment_receipt_validations"`);
    await queryRunner.query(`DROP TABLE "authorized_bank_accounts"`);
  }
}
