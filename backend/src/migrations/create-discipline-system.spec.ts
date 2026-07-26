import { readFileSync } from 'fs';
import { join } from 'path';

describe('CreateDisciplineSystem migration', () => {
  const sql = readFileSync(
    join(__dirname, '1785100000000-CreateDisciplineSystem.ts'),
    'utf8',
  );

  it('keeps all rating and report directions separate', () => {
    expect(sql).toContain("'client_to_employee'");
    expect(sql).toContain("'employee_to_client'");
    expect(sql).toContain("'driver_to_employee'");
    expect(sql).toContain("'employee_to_driver'");
    expect(sql).toContain('UQ_interaction_rating_service_direction');
    expect(sql).toContain('UQ_interaction_rating_trip_direction');
  });

  it('creates auditable reports and manual sanctions', () => {
    expect(sql).toContain('CREATE TABLE "conduct_reports"');
    expect(sql).toContain('CREATE TABLE "disciplinary_sanctions"');
    expect(sql).toContain("'confirmado','no_sustentado'");
    expect(sql).toContain("'suspension','permanent_ban'");
  });

  it('migrates historical ratings and reports without mixing public metrics', () => {
    expect(sql).toContain('INSERT INTO "interaction_ratings"');
    expect(sql).toContain('INSERT INTO "conduct_reports"');
    expect(sql).toContain("direction = 'client_to_employee'");
    expect(sql).toContain('DROP TRIGGER IF EXISTS trigger_actualizar_metricas_empleada');
  });
});
