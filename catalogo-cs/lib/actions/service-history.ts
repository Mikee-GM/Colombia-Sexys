"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";
import type {
  ServiceTrashItem,
  WeeklyHistoryData,
} from "@/lib/service-history";

export async function getWeeklyServiceHistory(input: {
  weekStart?: string;
  employeeId?: string;
}) {
  const query = new URLSearchParams();
  if (input.weekStart) query.set("weekStart", input.weekStart);
  if (input.employeeId) query.set("employeeId", input.employeeId);
  return apiFetch<WeeklyHistoryData>(`/service-history/weekly?${query}`);
}

export async function getServiceTrash() {
  return apiFetch<ServiceTrashItem[]>("/service-history/trash");
}

async function lifecycleAction(
  path: string,
  method: "POST" | "DELETE",
  body: Record<string, string>,
) {
  try {
    const data = await apiFetch(path, {
      method,
      body: JSON.stringify(body),
    });
    revalidatePath("/admin/servicios");
    revalidatePath("/admin/servicios/papelera");
    revalidatePath("/admin/services");
    revalidatePath("/jefe/historial");
    revalidatePath("/empleada/historial");
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo completar la acción administrativa",
    };
  }
}

export async function cancelOrVoidServiceAction(
  serviceId: string,
  reason: string,
) {
  return lifecycleAction(
    `/admin/service-control/${serviceId}/cancel-or-void`,
    "POST",
    { reason },
  );
}

export async function softDeleteServiceAction(
  serviceId: string,
  reason: string,
) {
  return lifecycleAction(`/admin/service-control/${serviceId}`, "DELETE", {
    reason,
  });
}

export async function restoreServiceAction(serviceId: string, reason: string) {
  return lifecycleAction(
    `/admin/service-control/${serviceId}/restore`,
    "POST",
    { reason },
  );
}

export async function hardDeleteServiceAction(
  serviceId: string,
  reason: string,
  confirmation: string,
) {
  return lifecycleAction(
    `/admin/service-control/${serviceId}/hard-delete`,
    "POST",
    { reason, confirmation },
  );
}
