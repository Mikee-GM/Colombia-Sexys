"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";
import type { ConversationMessage, Service } from "@/lib/types";

function revalidateAdminViews() {
  try {
    revalidatePath("/admin/services");
    revalidatePath("/admin/dashboard");
    revalidatePath("/admin/god-eye");
    revalidatePath("/admin/transport");
    revalidatePath("/admin");
  } catch {
    // ignore outside request context
  }
}

export async function getServices() {
  return apiFetch<Service[]>("/services");
}

export async function getServicesAction() {
  return apiFetch<Service[]>("/services");
}

export async function getPendingServices() {
  return apiFetch<Service[]>("/services/pendientes");
}

export async function getServiceByIdAction(serviceId: string) {
  try {
    const data = await apiFetch<Service>(`/services/${serviceId}`);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo obtener el detalle del servicio",
    };
  }
}

export async function decideServiceAction(
  serviceId: string,
  decision: "aceptar" | "rechazar",
  transportType: "chofer" | "uber" = "chofer",
  bossNotes?: string,
) {
  try {
    const result = await apiFetch(`/services/${serviceId}/${decision}`, {
      method: "POST",
      body:
        decision === "aceptar"
          ? JSON.stringify({
              transportType,
              bossNotes: bossNotes?.trim() || undefined,
            })
          : undefined,
    });
    revalidateAdminViews();
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo procesar la acción",
    };
  }
}

export async function updateServiceAction(
  serviceId: string,
  data: {
    duracionPactadaHoras?: number;
    metodoPago?: "efectivo" | "tarjeta" | "transferencia" | "mixto";
    notas?: string;
    notasJefe?: string;
  },
) {
  try {
    const updated = await apiFetch<Service>(`/services/${serviceId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    revalidateAdminViews();
    return { success: true, data: updated };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el servicio",
    };
  }
}

export async function cancelServiceAction(serviceId: string) {
  try {
    await apiFetch(`/services/${serviceId}/cancel`, { method: "POST" });
    revalidateAdminViews();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo cancelar el servicio",
    };
  }
}

export async function getServiceMessagesAction(serviceId: string): Promise<ConversationMessage[]> {
  const result = await apiFetch<{ messages: ConversationMessage[] }>(
    `/telegram-conversations/service/${serviceId}`,
  );
  return result.messages || [];
}

export async function sendServiceMessageAction(serviceId: string, message: string) {
  try {
    const data = await apiFetch<ConversationMessage>(
      `/telegram-conversations/service/${serviceId}/messages`,
      {
        method: "POST",
        body: JSON.stringify({ message }),
      },
    );
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo enviar el mensaje",
    };
  }
}

export async function chooseReturnTransportAction(
  serviceId: string,
  transportType: "chofer" | "uber",
) {
  try {
    const data = await apiFetch(`/services/${serviceId}/return-transport`, {
      method: "POST",
      body: JSON.stringify({ transportType }),
    });
    revalidateAdminViews();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo elegir el regreso",
    };
  }
}

export async function changeTripTransportAction(
  tripId: string,
  transportType: "chofer" | "uber",
) {
  try {
    const data = await apiFetch(`/services/trips/${tripId}/transport`, {
      method: "PATCH",
      body: JSON.stringify({ transportType }),
    });
    revalidateAdminViews();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo cambiar el transporte",
    };
  }
}

export async function confirmUberFareAction(tripId: string, amount: number) {
  try {
    await apiFetch(`/services/trips/${tripId}/uber-fare`, {
      method: "POST",
      body: JSON.stringify({ amount }),
    });
    revalidateAdminViews();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo registrar la tarifa",
    };
  }
}

export async function uploadUberScreenshotAction(formData: FormData) {
  try {
    const tripId = String(formData.get("tripId") || "");
    const file = formData.get("file");
    const payload = new FormData();
    if (!(file instanceof File)) throw new Error("Selecciona una imagen");
    payload.append("file", file);
    await apiFetch(`/services/trips/${tripId}/uber-screenshot`, {
      method: "POST",
      body: payload,
    });
    revalidateAdminViews();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo enviar la captura",
    };
  }
}

export async function getClientsAction() {
  try {
    const clients = await apiFetch<any[]>("/clients");
    return { success: true, data: clients };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo cargar la lista de clientes",
    };
  }
}

export async function getActiveLocationsAction() {
  try {
    const locations = await apiFetch<any[]>("/transport-operations/locations/active");
    return { success: true, data: locations };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo cargar las ubicaciones",
    };
  }
}

export async function createManualServiceAction(payload: any) {
  try {
    const data = await apiFetch<Service>("/services", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    revalidateAdminViews();
    try {
      revalidatePath("/jefe");
    } catch {}
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo crear el servicio",
    };
  }
}


