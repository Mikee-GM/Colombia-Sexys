"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";
import type { Client, ConversationMessage, Service } from "@/lib/types";
import type { CancellationReason } from "@/lib/cancellation-reasons";
import { asList } from "@/lib/paginated";

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

export async function cancelServiceAction(
  serviceId: string,
  reason: CancellationReason,
  note?: string,
) {
  try {
    await apiFetch(`/services/${serviceId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason, note: note?.trim() || undefined }),
    });
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

/**
 * Completa o corrige el motivo de una cancelacion ya registrada. Los servicios
 * cancelados antes de que existiera el campo no tienen ninguno, y en una
 * cancelacion apurada se elige mal; sin poder corregirlo, el dato que decide
 * quien asume el costo se queda mal para siempre.
 */
export async function updateCancellationAction(
  serviceId: string,
  reason: CancellationReason,
  note?: string,
) {
  try {
    await apiFetch(`/services/${serviceId}/cancellation`, {
      method: "PATCH",
      body: JSON.stringify({ reason, note: note?.trim() || undefined }),
    });
    revalidateAdminViews();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo guardar el motivo de la cancelación",
    };
  }
}

/**
 * `/clients` responde paginado (`{ items, total, limit, offset }`), no un array.
 * Se normaliza aqui para que la vista siempre reciba una lista iterable.
 */
export async function getClientsAction() {
  try {
    const response = await apiFetch<unknown>("/clients?limit=200");
    return { success: true, data: asList<Client>(response) };
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

/**
 * Corrige a mano el estado de un viaje.
 *
 * Los estados de un viaje solo avanzan y solo los mueve el chofer, asi que un
 * toque equivocado --marcar "ya recogi" antes de tiempo-- no se podia deshacer
 * desde ningun sitio, y el resto del flujo seguia adelante con el dato malo.
 *
 * No admite finalizar ni cancelar: los dos tienen su propio camino, con su
 * costo y su liquidacion. Esto solo arregla un dedazo.
 */
export async function corregirEstadoDeViaje(
  tripId: string,
  estado: "aceptado" | "en_camino" | "llegado" | "en_curso",
  motivo: string,
) {
  try {
    await apiFetch(`/services/trips/${tripId}/corregir-estado`, {
      method: "POST",
      body: JSON.stringify({ estado, motivo: motivo.trim() }),
    });
    revalidateAdminViews();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo corregir el estado del viaje",
    };
  }
}

/**
 * Cierra un servicio en nombre de la modelo.
 *
 * Para cuando ella no puede: telefono muerto, sin cobertura, o se le olvido.
 * Sin esto el servicio se queda en curso indefinidamente y ella bloqueada como
 * no disponible, sin transporte de regreso y sin entrar en la liquidacion.
 */
export async function cerrarPorOficinaAction(
  serviceId: string,
  motivo: string,
) {
  try {
    await apiFetch(`/services/${serviceId}/cerrar-por-oficina`, {
      method: "POST",
      body: JSON.stringify({ motivo: motivo.trim() }),
    });
    revalidateAdminViews();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo cerrar el servicio",
    };
  }
}

/**
 * Mueve un servicio a otra modelo sin cancelarlo.
 *
 * Cancelar y volver a crear pierde la conversacion con el cliente, el historico
 * y cualquier anticipo. El precio pactado no se recalcula.
 */
export async function reasignarEmpleadaAction(
  serviceId: string,
  empleadaId: string,
  motivo: string,
) {
  try {
    await apiFetch(`/services/${serviceId}/reasignar-empleada`, {
      method: "POST",
      body: JSON.stringify({ empleadaId, motivo: motivo.trim() }),
    });
    revalidateAdminViews();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo reasignar",
    };
  }
}

/** Mueve un viaje a otro chofer. Solo mientras no haya terminado. */
export async function reasignarChoferAction(
  tripId: string,
  choferId: string,
  motivo: string,
) {
  try {
    await apiFetch(`/services/trips/${tripId}/reasignar-chofer`, {
      method: "POST",
      body: JSON.stringify({ choferId, motivo: motivo.trim() }),
    });
    revalidateAdminViews();
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "No se pudo reasignar el viaje",
    };
  }
}
