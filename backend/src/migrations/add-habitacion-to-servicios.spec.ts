import { AddHabitacionToServicios1796000000000 } from './1796000000000-AddHabitacionToServicios';

describe('AddHabitacionToServicios migration', () => {
  it('agrega la columna habitacion de forma idempotente', async () => {
    const query = jest.fn();
    const migration = new AddHabitacionToServicios1796000000000();

    await migration.up({ query } as any);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('ALTER TABLE "servicios"');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "habitacion"');
    expect(sql).toContain('character varying(50)');
  });

  it('elimina la columna habitacion en el rollback', async () => {
    const query = jest.fn();
    const migration = new AddHabitacionToServicios1796000000000();

    await migration.down({ query } as any);

    const sql = query.mock.calls.map(([statement]) => statement).join('\n');
    expect(sql).toContain('ALTER TABLE "servicios"');
    expect(sql).toContain('DROP COLUMN IF EXISTS "habitacion"');
  });
});
