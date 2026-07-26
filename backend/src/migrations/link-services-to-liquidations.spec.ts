import { LinkServicesToLiquidations1784700000000 } from './1784700000000-LinkServicesToLiquidations';

describe('LinkServicesToLiquidations migration', () => {
  it('crea una llave única e importa históricos mediante upsert', async () => {
    const query = jest.fn();
    const migration = new LinkServicesToLiquidations1784700000000();

    await migration.up({ query } as any);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('uq_liquidation_records_service');
    expect(sql).toContain(`s."estado" = 'finalizado'`);
    expect(sql).toContain('ON CONFLICT ("service_id")');
    expect(sql).toContain('s."total_base"');
    expect(sql).toContain('s."total_extras"');
    expect(sql).toContain('s."total_transporte"');
  });
});
