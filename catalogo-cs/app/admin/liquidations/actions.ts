"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";
import type {
  CreateDebtInput,
  CreatePaymentInput,
  DebtWithEmployee,
  DriverLiquidationDriver,
  DriverLiquidationReport,
  LiquidationCommissionSettings,
  LiquidationDebt,
  LiquidationEmployee,
  LiquidationRecord,
  LiquidationReport,
  LiquidationRecordInput,
  WeeklySettlementSummary,
} from "@/components/liquidations/types";
import type { DriverKpi, EmployeeKpi } from "@/lib/types";

const periodParams = (startDate: string, endDate: string, employeeId?: string) => {
  const params = new URLSearchParams({ startDate, endDate });
  if (employeeId) params.set("employeeId", employeeId);
  return params.toString();
};

export async function getLiquidationsRecords(startDate: string, endDate: string) {
  return await apiFetch<LiquidationRecord[]>(
    `/liquidations/records?${periodParams(startDate, endDate)}`,
  );
}

export async function getLiquidationEmployees(startDate: string, endDate: string) {
  return await apiFetch<LiquidationEmployee[]>(
    `/liquidations/employees?${periodParams(startDate, endDate)}`,
  );
}

/** Corte semanal de todas las empleadas con actividad, en una sola peticion. */
export async function getWeeklySummary(startDate: string, endDate: string) {
  return await apiFetch<WeeklySettlementSummary[]>(
    `/liquidations/weekly-summary?${periodParams(startDate, endDate)}`,
  );
}

export async function getLiquidationReport(
  startDate: string,
  endDate: string,
  employeeId: string,
) {
  return await apiFetch<LiquidationReport>(
    `/liquidations/report?${periodParams(startDate, endDate, employeeId)}`,
  );
}

export async function confirmWeeklySettlement(
  startDate: string,
  endDate: string,
  employeeId: string,
) {
  const result = await apiFetch("/liquidations/weekly-settlements/confirm", {
    method: "POST",
    body: JSON.stringify({ startDate, endDate, employeeId }),
  });
  revalidatePath("/admin/liquidations");
  return result;
}

/**
 * Cambia la politica de comision sobre extras con tarjeta.
 *
 * Se revalidan las dos rutas porque el cambio mueve el neto de todos los
 * cortes abiertos, no solo el de la empleada que se estaba mirando. Los cortes
 * ya confirmados no se recalculan: su neto quedo congelado al confirmarlos.
 */
export async function updateLiquidationSettings(
  data: Partial<LiquidationCommissionSettings>,
) {
  const settings = await apiFetch<LiquidationCommissionSettings>(
    "/liquidations/settings",
    { method: "PATCH", body: JSON.stringify(data) },
  );
  revalidatePath("/admin/liquidations");
  revalidatePath("/admin/liquidations/[id]", "page");
  return settings;
}

export async function createLiquidationRecord(data: LiquidationRecordInput) {
  const record = await apiFetch<LiquidationRecord>("/liquidations/records", {
    method: "POST",
    body: JSON.stringify(data),
  });
  revalidatePath("/admin/liquidations");
  return record;
}

export async function updateRecord(
  recordId: string,
  data: Partial<LiquidationRecordInput>,
) {
  const record = await apiFetch<LiquidationRecord>(
    `/liquidations/records/${recordId}`,
    { method: "PATCH", body: JSON.stringify(data) },
  );
  revalidatePath("/admin/liquidations");
  return record;
}

export async function getDebts(employeeId: string) {
  return await apiFetch<LiquidationDebt[]>(
    `/liquidations/employees/${employeeId}/debts`,
  );
}

/** Cartera completa, en una sola peticion. */
export async function getAllDebts() {
  return await apiFetch<DebtWithEmployee[]>("/liquidations/debts");
}

export async function createDebt(employeeId: string, data: CreateDebtInput) {
  const debt = await apiFetch<LiquidationDebt>(
    `/liquidations/employees/${employeeId}/debts`,
    { method: "POST", body: JSON.stringify(data) },
  );
  revalidatePath("/admin/liquidations");
  return debt;
}

export async function deleteDebt(employeeId: string, debtId: string) {
  await apiFetch<void>(
    `/liquidations/employees/${employeeId}/debts/${debtId}`,
    { method: "DELETE" },
  );
  revalidatePath("/admin/liquidations");
}

export async function addDebtPayment(
  employeeId: string,
  debtId: string,
  data: CreatePaymentInput,
) {
  const debt = await apiFetch<LiquidationDebt>(
    `/liquidations/employees/${employeeId}/debts/${debtId}/payments`,
    { method: "POST", body: JSON.stringify(data) },
  );
  revalidatePath("/admin/liquidations");
  return debt;
}

export async function deleteDebtPayment(
  employeeId: string,
  debtId: string,
  paymentId: string,
) {
  await apiFetch<void>(
    `/liquidations/employees/${employeeId}/debts/${debtId}/payments/${paymentId}`,
    { method: "DELETE" },
  );
  revalidatePath("/admin/liquidations");
}

export async function getActiveDrivers(startDate: string, endDate: string) {
  return await apiFetch<DriverLiquidationDriver[]>(
    `/transport-operations/driver-settlements/active-drivers?${periodParams(startDate, endDate)}`,
  );
}

export async function getDriverReport(
  startDate: string,
  endDate: string,
  driverId: string,
) {
  const params = new URLSearchParams({ startDate, endDate, driverId });
  return await apiFetch<DriverLiquidationReport>(
    `/transport-operations/driver-settlements/report?${params.toString()}`,
  );
}

export async function confirmDriverSettlement(
  startDate: string,
  endDate: string,
  driverId: string,
) {
  const result = await apiFetch(
    `/transport-operations/driver-settlements/${driverId}/pay`,
    { method: "POST", body: JSON.stringify({ startDate, endDate }) },
  );
  revalidatePath("/admin/liquidations");
  return result;
}

export async function getEmployeeRankingPositions() {
  const kpis = await apiFetch<EmployeeKpi[]>("/employees/kpis");
  const total = kpis.filter((kpi) => kpi.position != null).length;
  return kpis.map((kpi) => ({ id: kpi.id, position: kpi.position, total }));
}

export async function getDriverRankingPositions() {
  const kpis = await apiFetch<DriverKpi[]>("/drivers/kpis");
  const total = kpis.filter((kpi) => kpi.position != null).length;
  return kpis.map((kpi) => ({ id: kpi.id, position: kpi.position, total }));
}

/**
 * Reabre una semana ya pagada de un chofer.
 *
 * La de la modelo se podia deshacer desde el principio; esta no, y el caso es
 * el mismo: aparece un viaje que faltaba, o se cerro el periodo equivocado.
 * Deshacer suelta los viajes para que la siguiente liquidacion los recoja con
 * el importe corregido.
 */
export async function undoDriverSettlement(
  driverId: string,
  startDate: string,
  motivo: string,
) {
  const result = await apiFetch(
    `/transport-operations/driver-settlements/${driverId}/undo`,
    { method: "POST", body: JSON.stringify({ startDate, motivo }) },
  );
  revalidatePath("/admin/liquidations");
  return result;
}
