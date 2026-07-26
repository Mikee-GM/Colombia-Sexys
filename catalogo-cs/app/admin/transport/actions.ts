"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";

export type PresetLocation = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  active: boolean;
  sortOrder: number;
};

export type TransportConfiguration = {
  externalLocationFee: number;
  locations: PresetLocation[];
};

export type PresetLocationInput = Omit<PresetLocation, "id">;
export type CashObligation = { id: string; serviceId: string; employeeId: string; amount: number; paidAmount: number; status: "pending" | "paid"; calculationStatus: "provisional" | "ready" | "paid"; pendingReason: string | null; customerTotal: number; uberDeduction: number; createdAt: string };
export type CashSummary = { obligations: CashObligation[]; employees: Array<{ id: string; name: string }>; total: number };
export type DriverTripSettlement = { id: string; choferId: string; tipo: "ida" | "regreso"; driverPayout: number; horaFinViaje: string; driverSettlementId?: string | null; chofer?: { nombre: string }; servicio?: { id: string } };

export async function getTransportConfiguration() {
  return apiFetch<TransportConfiguration>("/transport-operations/configuration");
}

export async function updateTransportFee(externalLocationFee: number) {
  const result = await apiFetch("/transport-operations/configuration", {
    method: "PATCH",
    body: JSON.stringify({ externalLocationFee }),
  });
  revalidatePath("/admin/transport");
  return result;
}

export async function savePresetLocation(id: string | null, input: PresetLocationInput) {
  const result = await apiFetch(
    id ? `/transport-operations/locations/${id}` : "/transport-operations/locations",
    { method: id ? "PATCH" : "POST", body: JSON.stringify(input) },
  );
  revalidatePath("/admin/transport");
  return result;
}

export async function deletePresetLocation(id: string) {
  await apiFetch(`/transport-operations/locations/${id}`, { method: "DELETE" });
  revalidatePath("/admin/transport");
}

export async function getCashObligations() { return apiFetch<CashSummary>("/transport-operations/cash-obligations"); }
export async function getDriverSettlements(startDate: string, endDate: string) { return apiFetch<DriverTripSettlement[]>(`/transport-operations/driver-settlements?startDate=${startDate}&endDate=${endDate}`); }
export async function registerCashPayment(employeeId: string, amount: number, note?: string) { const result = await apiFetch("/transport-operations/cash-payments", { method: "POST", body: JSON.stringify({ employeeId, amount, note }) }); revalidatePath("/admin/transport"); return result; }
export async function closeCashObligation(id: string) { const result = await apiFetch(`/transport-operations/cash-obligations/${id}/close`, { method: "POST" }); revalidatePath("/admin/transport"); return result; }
export async function payDriverSettlement(driverId: string, startDate: string, endDate: string) { const result = await apiFetch(`/transport-operations/driver-settlements/${driverId}/pay`, { method: "POST", body: JSON.stringify({ startDate, endDate }) }); revalidatePath("/admin/transport"); return result; }
