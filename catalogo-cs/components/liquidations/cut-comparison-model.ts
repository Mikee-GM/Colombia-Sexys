import type { LiquidationRecord, LiquidationReport, ServiceDiscrepancy } from "./types";

export interface CutComparisonRow {
  key: string;
  serviceId: string | null;
  occurredAt: string;
  office: LiquidationRecord[];
  employee: LiquidationRecord[];
  discrepancy?: ServiceDiscrepancy;
}

/** Match only explicit service IDs; independent adjustments must never be paired by date or amount. */
export function buildCutComparisonRows(
  report: Pick<LiquidationReport, "officeRecords" | "employeeRecords" | "serviceDiscrepancies">,
): CutComparisonRow[] {
  const rows = new Map<string, CutComparisonRow>();
  for (const side of ["office", "employee"] as const) {
    const records = side === "office" ? report.officeRecords : report.employeeRecords;
    for (const record of records) {
      const key = record.serviceId ? `service:${record.serviceId}` : `${side}:${record.id}`;
      const row = rows.get(key) ?? {
        key,
        serviceId: record.serviceId,
        occurredAt: record.occurredAt,
        office: [],
        employee: [],
      };
      row[side].push(record);
      if (new Date(record.occurredAt).getTime() > new Date(row.occurredAt).getTime()) {
        row.occurredAt = record.occurredAt;
      }
      rows.set(key, row);
    }
  }
  for (const discrepancy of report.serviceDiscrepancies) {
    const row = rows.get(`service:${discrepancy.serviceId}`);
    if (row) row.discrepancy = discrepancy;
  }
  return [...rows.values()].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
  );
}
