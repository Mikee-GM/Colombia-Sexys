import { MigrationInterface, QueryRunner } from 'typeorm';

export class LinkServicesToLiquidations1784700000000 implements MigrationInterface {
  name = 'LinkServicesToLiquidations1784700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "liquidation_records" ADD COLUMN IF NOT EXISTS "service_id" uuid`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_liquidation_records_service" ON "liquidation_records" ("service_id")`,
    );
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "liquidation_records"
          ADD CONSTRAINT "FK_liquidation_records_service"
          FOREIGN KEY ("service_id") REFERENCES "servicios"("id") ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await queryRunner.query(`
      INSERT INTO "liquidation_records" (
        "service_id", "employee_id", "registered_by_user_id", "source_role",
        "occurred_at", "service_total", "payment_method", "cash_amount",
        "card_amounts", "company_percentage", "extra_amount", "promotion",
        "membership_amount", "company_transport_expense", "transport_excess",
        "has_outbound_driver", "has_return_driver", "cancelled", "is_fine",
        "fine_amount", "created_at", "updated_at"
      )
      SELECT
        s."id", s."empleada_id", s."jefe_id",
        CASE WHEN u."rol" = 'admin' THEN 'admin' ELSE 'jefe' END,
        s."hora_fin_servicio", s."total_base", s."metodo_pago",
        CASE WHEN s."metodo_pago" = 'efectivo' THEN s."total_base" ELSE 0 END,
        CASE WHEN s."metodo_pago" IN ('tarjeta', 'transferencia')
          THEN jsonb_build_array(s."total_base") ELSE '[]'::jsonb END,
        40, s."total_extras", false, 0, s."total_transporte", 0,
        EXISTS (SELECT 1 FROM "viajes" v WHERE v."servicio_id" = s."id" AND v."tipo" = 'ida' AND v."proveedor_transporte" = 'interno'),
        EXISTS (SELECT 1 FROM "viajes" v WHERE v."servicio_id" = s."id" AND v."tipo" = 'regreso' AND v."proveedor_transporte" = 'interno'),
        false, false, 0, now(), now()
      FROM "servicios" s
      INNER JOIN "usuarios" u ON u."id" = s."jefe_id"
      WHERE s."estado" = 'finalizado' AND s."hora_fin_servicio" IS NOT NULL
        AND u."rol" IN ('admin', 'jefe')
      ON CONFLICT ("service_id") DO UPDATE SET
        "employee_id" = EXCLUDED."employee_id",
        "registered_by_user_id" = EXCLUDED."registered_by_user_id",
        "source_role" = EXCLUDED."source_role",
        "occurred_at" = EXCLUDED."occurred_at",
        "service_total" = EXCLUDED."service_total",
        "payment_method" = EXCLUDED."payment_method",
        "cash_amount" = EXCLUDED."cash_amount",
        "card_amounts" = EXCLUDED."card_amounts",
        "extra_amount" = EXCLUDED."extra_amount",
        "company_transport_expense" = EXCLUDED."company_transport_expense",
        "has_outbound_driver" = EXCLUDED."has_outbound_driver",
        "has_return_driver" = EXCLUDED."has_return_driver",
        "updated_at" = now()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "liquidation_records" DROP CONSTRAINT IF EXISTS "FK_liquidation_records_service"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_liquidation_records_service"`,
    );
    await queryRunner.query(
      `ALTER TABLE "liquidation_records" DROP COLUMN IF EXISTS "service_id"`,
    );
  }
}
