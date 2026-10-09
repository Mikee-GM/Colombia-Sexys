import { ForbiddenException } from '@nestjs/common';
import {
  assertEmployeeWeekAllowed,
  resolveBusinessWeek,
} from './business-week';

describe('semana de negocio del historial', () => {
  const now = new Date('2026-10-09T18:00:00.000Z');

  it('abre el lunes a medianoche y cierra antes del lunes siguiente en Mexico', () => {
    const week = resolveBusinessWeek('2026-10-05', now);
    expect(week.from.toISOString()).toBe('2026-10-05T06:00:00.000Z');
    expect(week.toExclusive.toISOString()).toBe('2026-10-12T06:00:00.000Z');
    expect(week.endDate).toBe('2026-10-11');
  });

  it('permite a empleada solo semana actual o anterior', () => {
    expect(() =>
      assertEmployeeWeekAllowed(resolveBusinessWeek('2026-10-05', now), now),
    ).not.toThrow();
    expect(() =>
      assertEmployeeWeekAllowed(resolveBusinessWeek('2026-09-28', now), now),
    ).not.toThrow();
    expect(() =>
      assertEmployeeWeekAllowed(resolveBusinessWeek('2026-09-21', now), now),
    ).toThrow(ForbiddenException);
  });
});
