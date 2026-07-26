"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";
import type {
  CreateDebtInput,
  CreatePaymentInput,
  LiquidationDebt,
  LiquidationEmployee,
  LiquidationRecord,
  LiquidationReport,
  LiquidationRecordInput,
} from "@/components/liquidations/types";

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
