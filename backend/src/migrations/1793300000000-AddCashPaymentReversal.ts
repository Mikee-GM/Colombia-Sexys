import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marca de reversion para los abonos de efectivo de las empleadas.
 *
 * Registrar el efectivo que entrega una empleada, o marcarla como pagada en el
 * corte semanal, eran operaciones sin vuelta atras: si el administrador se
 * equivocaba de empleada o de monto —algo normal, porque los captura a mano
 * mientras atiende otras cosas— el saldo quedaba mal para siempre.
 *
 * Se revierte marcando, no borrando. La contraparte de estos numeros es la
 * liquidacion semanal que revisan la empleada y la oficina: si una fila
 * desapareciera sin rastro, ninguna de las dos podria explicar por que el saldo
 * dejo de cuadrar. Ademas `employee_cash_payment_allocations` dice exactamente
 * que obligacion toco el abono y por cuanto, asi que deshacerlo es restar esas
 * asignaciones; conservar la fila es lo que mantiene esa trazabilidad legible.
 */
export class AddCashPaymentReversal1793300000000 implements MigrationInterface {
  name = 'AddCashPaymentReversal1793300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE public.employee_cash_payments
         ADD COLUMN IF NOT EXISTS "reverted_at" timestamp with time zone`,
    );
    await queryRunner.query(
      `ALTER TABLE public.employee_cash_payments
         ADD COLUMN IF NOT EXISTS "reverted_by_user_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE public.employee_cash_payments
         ADD COLUMN IF NOT EXISTS "reverted_reason" character varying(240)`,
    );

    /*
     * RESTRICT y no CASCADE: borrar al usuario que revirtio no puede llevarse
     * por delante el abono, que es un movimiento de dinero. Es la misma regla
     * que ya siguen `liquidation_debts` y el registro de auditoria.
     */
    await queryRunner.query(
      `ALTER TABLE public.employee_cash_payments
         DROP CONSTRAINT IF EXISTS "FK_employee_cash_payments_reverted_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE public.employee_cash_payments
         ADD CONSTRAINT "FK_employee_cash_payments_reverted_by"
         FOREIGN KEY ("reverted_by_user_id") REFERENCES public.usuarios("id")
         ON DELETE RESTRICT`,
    );

    /*
     * El historial de movimientos de la ficha se lee por empleada y en orden
     * cronologico inverso, que es justo este indice.
     */
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_employee_cash_payments_employee_created"
         ON public.employee_cash_payments ("employee_id", "created_at" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS public."IDX_employee_cash_payments_employee_created"`,
    );
    await queryRunner.query(
      `ALTER TABLE public.employee_cash_payments
         DROP CONSTRAINT IF EXISTS "FK_employee_cash_payments_reverted_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE public.employee_cash_payments
         DROP COLUMN IF EXISTS "reverted_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE public.employee_cash_payments
         DROP COLUMN IF EXISTS "reverted_by_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE public.employee_cash_payments
         DROP COLUMN IF EXISTS "reverted_at"`,
    );
  }
}
