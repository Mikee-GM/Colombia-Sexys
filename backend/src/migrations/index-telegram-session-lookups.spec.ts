import { IndexTelegramSessionLookups1793200000000 } from './1793200000000-IndexTelegramSessionLookups';

describe('IndexTelegramSessionLookups migration', () => {
  it('indexa las tres búsquedas que recorrían la tabla entera', async () => {
    const query = jest.fn();
    const migration = new IndexTelegramSessionLookups1793200000000();

    await migration.up({ query } as any);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    // Las expresiones tienen que coincidir literalmente con las del código:
    // un índice sobre otra expresión no lo usa el planificador.
    expect(sql).toContain(`("data"->>'bossThreadId')`);
    expect(sql).toContain(`("data"->>'bossGroupId')`);
    expect(sql).toContain(`("data"->>'esperandoEmpleadaId')`);
    expect(sql).toContain('"updated_at"');
    // Parciales: la mayoría de sesiones no cuelgan de un tema del jefe.
    expect(sql).toContain(`WHERE "data"->>'bossThreadId' IS NOT NULL`);
  });

  it('deshace todos los índices que crea', async () => {
    const query = jest.fn();
    const migration = new IndexTelegramSessionLookups1793200000000();

    await migration.down({ query } as any);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('idx_telegram_sessions_boss_thread');
    expect(sql).toContain('idx_telegram_sessions_esperando_empleada');
    expect(sql).toContain('idx_telegram_sessions_updated_at');
  });
});
