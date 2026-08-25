import { AddCashPaymentReversal1793300000000 } from './1793300000000-AddCashPaymentReversal';

describe('AddCashPaymentReversal migration', () => {
  it('añade las tres columnas que describen una reversión', async () => {
    const query = jest.fn();
    const migration = new AddCashPaymentReversal1793300000000();

    await migration.up({ query } as never);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('"reverted_at"');
    expect(sql).toContain('"reverted_by_user_id"');
    expect(sql).toContain('"reverted_reason"');
    // Idempotente: la migración se aplica sobre entornos ya desplegados.
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS');
  });

  /**
   * RESTRICT y no CASCADE: borrar al usuario que revirtió no puede llevarse por
   * delante el abono, que es un movimiento de dinero. Es la regla que ya siguen
   * las deudas y el registro de auditoría.
   */
  it('protege el abono frente al borrado del usuario que lo revirtió', async () => {
    const query = jest.fn();
    const migration = new AddCashPaymentReversal1793300000000();

    await migration.up({ query } as never);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('REFERENCES public.usuarios("id")');
    expect(sql).toContain('ON DELETE RESTRICT');
    expect(sql).not.toContain('ON DELETE CASCADE');
  });

  it('indexa el historial por empleada y fecha', async () => {
    const query = jest.fn();
    const migration = new AddCashPaymentReversal1793300000000();

    await migration.up({ query } as never);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('IDX_employee_cash_payments_employee_created');
    expect(sql).toContain('"employee_id", "created_at" DESC');
  });

  it('deshace todo lo que crea', async () => {
    const query = jest.fn();
    const migration = new AddCashPaymentReversal1793300000000();

    await migration.down({ query } as never);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('IDX_employee_cash_payments_employee_created');
    expect(sql).toContain('FK_employee_cash_payments_reverted_by');
    expect(sql).toContain('"reverted_at"');
    expect(sql).toContain('"reverted_by_user_id"');
    expect(sql).toContain('"reverted_reason"');
  });
});
