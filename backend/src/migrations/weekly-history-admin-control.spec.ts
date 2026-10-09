import { WeeklyHistoryAdminControl1810000900000 } from './1810000900000-WeeklyHistoryAdminControl';

describe('WeeklyHistoryAdminControl migration', () => {
  it('crea snapshots, papelera y auditoria sin borrar conversaciones', async () => {
    const queries: string[] = [];
    const runner = {
      query: jest.fn((sql: string) => {
        queries.push(sql);
        return Promise.resolve();
      }),
    } as any;
    await new WeeklyHistoryAdminControl1810000900000().up(runner);
    const sql = queries.join('\n');
    expect(sql).toContain('service_base_amount_snapshot');
    expect(sql).toContain('company_commission_snapshot');
    expect(sql).toContain('service_admin_audit');
    expect(sql).toContain('historical_service_id');
    expect(sql).not.toContain('TRUNCATE');
    expect(sql).not.toContain('DROP TABLE "conversaciones_telegram"');
  });
});
