import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";
import type { ConversationMessage, Service, ServiceStatus } from "@/lib/types";

export const activeServiceStatuses: ServiceStatus[] = ["en_curso"];

export function isActiveService(service: Service) {
  return activeServiceStatuses.includes(service.estado);
}

export async function getServices() {
  return apiFetch<Service[]>("/services");
}

export async function getPendingServices() {
  return apiFetch<Service[]>("/services/pendientes");
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
    revalidatePath("/admin/services");
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
    revalidatePath("/admin/services");
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
    revalidatePath("/admin/services");
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
    revalidatePath("/admin/services");
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
    revalidatePath("/admin/services");
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
    revalidatePath("/admin/services");
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
    revalidatePath("/admin/services");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo enviar la captura",
    };
  }
}
