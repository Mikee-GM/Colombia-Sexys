import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Comision sobre los extras cobrados con tarjeta.
 *
 * La regla existia desde el principio dentro de `liquidation-calculator.ts`:
 * un 15% fijo sobre cualquier extra no-efectivo de 1000 o mas. Tenia dos
 * problemas. El porcentaje y el umbral estaban incrustados en el codigo, asi
 * que cambiarlos exigia un despliegue; y la condicion era "no es efectivo",
 * que mete en el mismo saco la tarjeta y la transferencia cuando solo la
 * primera le cuesta comision a la empresa.
 *
 * Esta migracion separa las dos cosas: guarda aparte lo cobrado con tarjeta en
 * cada registro y lleva el porcentaje y el umbral a una tabla de una sola fila,
 * editable desde la pantalla de liquidacion.
 */
export class CardExtraCommissionSettings1793500000000 implements MigrationInterface {
  name = 'CardExtraCommissionSettings1793500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "liquidation_settings" (
        "id" smallint PRIMARY KEY DEFAULT 1 CHECK ("id" = 1),
        "card_extra_commission_percentage" numeric(5,2) NOT NULL DEFAULT 15
          CHECK ("card_extra_commission_percentage" >= 0
             AND "card_extra_commission_percentage" <= 100),
        "card_extra_commission_threshold" numeric(12,2) NOT NULL DEFAULT 1000
          CHECK ("card_extra_commission_threshold" >= 0),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "updated_by_user_id" uuid REFERENCES "usuarios"("id") ON DELETE SET NULL
      );
    `);

    // Los valores por defecto son exactamente los que estaban incrustados en el
    // calculador, para que la migracion no cambie ningun corte por si sola.
    await queryRunner.query(`
      INSERT INTO "liquidation_settings" ("id") VALUES (1)
      ON CONFLICT ("id") DO NOTHING;
    `);

    await queryRunner.query(`
      ALTER TABLE "liquidation_records"
        ADD COLUMN IF NOT EXISTS "card_extra_amount" numeric(12,2) NOT NULL DEFAULT 0;
    `);

    /*
     * Relleno historico. Se reconstruye desde `extras_servicio`, que si guarda
     * el metodo de pago de cada extra. En un servicio grupal cada registro de
     * liquidacion es de una participante, y el extra se le imputa por su
     * `participant_id`; los extras sin participante son de un servicio
     * individual y van completos a la empleada del registro.
     */
    await queryRunner.query(`
      UPDATE "liquidation_records" lr
         SET "card_extra_amount" = COALESCE((
               SELECT SUM(ex."precio_cobrado")
                 FROM "extras_servicio" ex
                 LEFT JOIN "service_participants" sp ON sp."id" = ex."participant_id"
                WHERE ex."servicio_id" = lr."service_id"
                  AND ex."metodo_pago" = 'tarjeta'
                  AND (ex."participant_id" IS NULL
                       OR sp."employee_id" = lr."employee_id")
             ), 0)
       WHERE lr."service_id" IS NOT NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "liquidation_records" DROP COLUMN IF EXISTS "card_extra_amount";
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "liquidation_settings";`);
  }
}
