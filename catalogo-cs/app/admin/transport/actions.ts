"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";
import type { CancellationReason } from "@/lib/cancellation-reasons";

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

export type PendingCancellationCost = {
  id: string;
  tipo: "ida" | "regreso";
  servicioId: string;
  empleadaNombre: string | null;
  canceladoAt: string | null;
  motivoCancelacion: CancellationReason | null;
  notaCancelacion: string | null;
  uberScreenshotUrl: string | null;
};

/**
 * Ubers de servicios cancelados cuyo costo sigue sin cerrarse. Mientras algo
 * aparezca aqui hay dinero gastado que no entro a ningun corte.
 */
export async function getPendingCancellationCosts() {
  return apiFetch<PendingCancellationCost[]>(
    "/services/trips/pending-cancellation-cost",
  );
}

/**
 * Cierra el costo de un viaje cancelado. `chargeToClient` decide si ese monto
 * se le cobra al cliente o lo absorbe la casa: no hay regla fija, depende de
 * quien causo la cancelacion y de con cuanto tiempo aviso.
 */
export async function settleCancellationCost(
  tripId: string,
  amount: number,
  chargeToClient: boolean,
) {
  try {
    await apiFetch(`/services/trips/${tripId}/cancellation-cost`, {
      method: "POST",
      body: JSON.stringify({ amount, chargeToClient }),
    });
    revalidatePath("/admin/transport");
    revalidatePath("/admin/services");
    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo cerrar el costo del viaje",
    };
  }
}

/** Completa o corrige el motivo de una cancelacion ya registrada. */
export async function updateCancellationDetails(
  serviceId: string,
  reason: CancellationReason,
  note?: string,
) {
  try {
    await apiFetch(`/services/${serviceId}/cancellation`, {
      method: "PATCH",
      body: JSON.stringify({ reason, note: note?.trim() || undefined }),
    });
    revalidatePath("/admin/transport");
    revalidatePath("/admin/services");
    return { success: true as const };
  } catch (error) {
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo guardar el motivo de la cancelación",
    };
  }
}

export async function getCashObligations() { return apiFetch<CashSummary>("/transport-operations/cash-obligations"); }
export async function getDriverSettlements(startDate: string, endDate: string) { return apiFetch<DriverTripSettlement[]>(`/transport-operations/driver-settlements?startDate=${startDate}&endDate=${endDate}`); }
// El panel de efectivo vive en /admin/dinero desde que se saco de Transporte.
// Revalidar solo /admin/transport dejaba la otra tabla con el saldo viejo: el
// abono se registraba, salia el aviso de exito y el numero no se movia hasta
// recargar a mano.
export async function registerCashPayment(employeeId: string, amount: number, note?: string) { const result = await apiFetch("/transport-operations/cash-payments", { method: "POST", body: JSON.stringify({ employeeId, amount, note }) }); revalidatePath("/admin/transport"); revalidatePath("/admin/dinero"); revalidatePath("/admin/liquidations"); return result; }
export async function closeCashObligation(id: string) { const result = await apiFetch(`/transport-operations/cash-obligations/${id}/close`, { method: "POST" }); revalidatePath("/admin/transport"); revalidatePath("/admin/dinero"); revalidatePath("/admin/liquidations"); return result; }
export async function payDriverSettlement(driverId: string, startDate: string, endDate: string) { const result = await apiFetch(`/transport-operations/driver-settlements/${driverId}/pay`, { method: "POST", body: JSON.stringify({ startDate, endDate }) }); revalidatePath("/admin/transport"); return result; }
