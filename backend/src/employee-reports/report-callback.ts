import {
  REPORT_CATEGORIES,
  ReportCategory,
} from './entities/employee-report.entity';

const CATEGORY_CODES: Record<ReportCategory, string> = {
  trato_inadecuado: 't',
  demora_impuntualidad: 'd',
  incumplimiento: 'i',
  cobro: 'c',
  seguridad: 's',
  otro: 'o',
};

const CODE_CATEGORIES = Object.fromEntries(
  REPORT_CATEGORIES.map((category) => [CATEGORY_CODES[category], category]),
) as Record<string, ReportCategory>;

export function buildReportCategoryCallback(
  origin: 'client' | 'driver',
  serviceId: string,
  category: ReportCategory,
) {
  const prefix = origin === 'client' ? 'erc' : 'erd';
  return `${prefix}:${serviceId}:${CATEGORY_CODES[category]}`;
}

export function parseReportCategoryCode(code: string) {
  return CODE_CATEGORIES[code];
}
