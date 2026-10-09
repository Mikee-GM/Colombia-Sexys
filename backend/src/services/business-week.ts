import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { desdeHoraDelNegocio, lunesDeLaSemana } from '../common/locale';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function addDays(dateOnly: string, days: number): string {
  const date = new Date(`${dateOnly}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type BusinessWeek = {
  startDate: string;
  endDate: string;
  from: Date;
  toExclusive: Date;
  previousStart: string;
  nextStart: string;
  isCurrent: boolean;
};

export function resolveBusinessWeek(
  requestedStart: string | undefined,
  now = new Date(),
): BusinessWeek {
  const currentStart = lunesDeLaSemana(now);
  const startDate = requestedStart?.trim() || currentStart;
  if (!DATE_ONLY.test(startDate)) {
    throw new BadRequestException('La semana debe tener formato YYYY-MM-DD');
  }
  const noon = new Date(`${startDate}T12:00:00.000Z`);
  if (Number.isNaN(noon.getTime()) || noon.getUTCDay() !== 1) {
    throw new BadRequestException('La semana debe comenzar en lunes');
  }
  const nextStart = addDays(startDate, 7);
  const from = desdeHoraDelNegocio(`${startDate}T00:00:00`);
  const toExclusive = desdeHoraDelNegocio(`${nextStart}T00:00:00`);
  if (!from || !toExclusive) {
    throw new BadRequestException('No se pudo interpretar la semana');
  }
  return {
    startDate,
    endDate: addDays(startDate, 6),
    from,
    toExclusive,
    previousStart: addDays(startDate, -7),
    nextStart,
    isCurrent: startDate === currentStart,
  };
}

export function assertEmployeeWeekAllowed(
  week: BusinessWeek,
  now = new Date(),
): void {
  const current = lunesDeLaSemana(now);
  const previous = addDays(current, -7);
  if (week.startDate !== current && week.startDate !== previous) {
    throw new ForbiddenException(
      'La empleada solo puede consultar la semana actual y la anterior',
    );
  }
}
