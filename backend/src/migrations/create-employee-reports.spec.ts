import { readFileSync } from 'fs';
import { join } from 'path';

describe('CreateEmployeeReports migration', () => {
  const sql = readFileSync(
    join(__dirname, '1784500000000-CreateEmployeeReports.ts'),
    'utf8',
  );

  it('creates auditable report and history tables', () => {
    expect(sql).toContain('CREATE TABLE "employee_reports"');
    expect(sql).toContain('CREATE TABLE "employee_report_history"');
    expect(sql).toContain('UQ_employee_reports_reporter_service_category');
    expect(sql).toContain('CHK_employee_reports_author');
  });

  it('defines the agreed workflow values and indexes', () => {
    expect(sql).toContain("'nuevo','en_revision','resuelto','descartado'");
    expect(sql).toContain("'normal','alta','urgente'");
    expect(sql).toContain('idx_employee_reports_status_priority');
  });
});
