import { QueryRunner } from 'typeorm';
import { AddEmployeeRatingMetrics1784401000000 } from './1784401000000-AddEmployeeRatingMetrics';

describe('AddEmployeeRatingMetrics migration', () => {
  const query = jest.fn().mockResolvedValue(undefined);
  const queryRunner = { query } as unknown as QueryRunner;
  const migration = new AddEmployeeRatingMetrics1784401000000();

  beforeEach(() => query.mockClear());

  it('creates constrained, trigger-maintained employee rating metrics', async () => {
    await migration.up(queryRunner);

    const sql = query.mock.calls.flat().join('\n');
    expect(sql).toContain('total_servicios_valorados');
    expect(sql).toContain('promedio_calificacion');
    expect(sql).toContain(
      'CHECK (calificacion IS NULL OR calificacion BETWEEN 1 AND 5)',
    );
    expect(sql).toContain("s.estado = 'finalizado'");
    expect(sql).toContain('AVG(s.calificacion)::numeric(3,2)');
    expect(sql).toContain('OLD.empleada_id IS DISTINCT FROM NEW.empleada_id');
    expect(sql).toContain(
      'AFTER INSERT OR DELETE OR UPDATE OF calificacion, estado, empleada_id ON servicios',
    );
  });

  it('removes the trigger, functions, constraint and columns on rollback', async () => {
    await migration.down(queryRunner);

    const sql = query.mock.calls.flat().join('\n');
    expect(sql).toContain('DROP TRIGGER IF EXISTS');
    expect(sql).toContain('DROP FUNCTION IF EXISTS');
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS');
    expect(sql).toContain('DROP COLUMN "promedio_calificacion"');
    expect(sql).toContain('DROP COLUMN "total_servicios_valorados"');
  });
});
