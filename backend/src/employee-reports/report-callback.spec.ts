import {
  buildReportCategoryCallback,
  parseReportCategoryCode,
} from './report-callback';
import { REPORT_CATEGORIES } from './entities/employee-report.entity';

describe('report callbacks', () => {
  const serviceId = '00000000-0000-4000-8000-000000000000';

  it.each(['client', 'driver'] as const)(
    'mantiene los callbacks de %s dentro del límite de Telegram',
    (origin) => {
      for (const category of REPORT_CATEGORIES) {
        const callback = buildReportCategoryCallback(
          origin,
          serviceId,
          category,
        );
        expect(Buffer.byteLength(callback, 'utf8')).toBeLessThanOrEqual(64);
      }
    },
  );

  it('recupera la categoría desde el código compacto', () => {
    expect(parseReportCategoryCode('d')).toBe('demora_impuntualidad');
    expect(parseReportCategoryCode('x')).toBeUndefined();
  });
});
