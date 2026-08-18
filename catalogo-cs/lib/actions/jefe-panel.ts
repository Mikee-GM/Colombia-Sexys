"use server";

import { apiFetch } from "@/lib/api-server";
import { getCurrentUser, isRedirectError } from "@/lib/auth";
import type { CashObligationSummary, ConversationMessage, Employee, GroupServiceRequest, Service } from "@/lib/types";
import { redirect } from "next/navigation";

async function requireJefe() {
  const user = await getCurrentUser();
  if (!user || user.rol !== "jefe") {
    redirect("/admin");
  }
  return user;
}

export async function getJefeEmployees(): Promise<Employee[]> {
  const jefe = await requireJefe();
  const employees = await apiFetch<Employee[]>("/employees");
  return employees.filter(
    (employee) => employee.jefeId === jefe.id || employee.jefeSecundarioId === jefe.id,
  );
}

export async function getJefeServices(): Promise<Service[]> {
  await requireJefe();
  return apiFetch<Service[]>("/services");
}

export async function getJefeCashObligations(): Promise<CashObligationSummary> {
  await requireJefe();
  return apiFetch<CashObligationSummary>("/transport-operations/cash-obligations");
}

export async function registerJefeCashPayment(employeeId: string, amount: number) {
  try {
    await assertAssignedEmployee(employeeId);
    await apiFetch("/transport-operations/cash-payments", {
      method: "POST",
      body: JSON.stringify({ employeeId, amount, note: "Entrega registrada por el jefe" }),
    });
    return { success: true };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { success: false, error: error instanceof Error ? error.message : "No se pudo registrar la entrega" };
  }
}

export async function closeJefeCashObligation(obligationId: string) {
  try {
    await apiFetch(`/transport-operations/cash-obligations/${obligationId}/close`, { method: "POST" });
    return { success: true };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { success: false, error: error instanceof Error ? error.message : "No se pudo saldar el servicio" };
  }
}

async function assertAssignedEmployee(employeeId: string) {
  const employees = await getJefeEmployees();
  if (!employees.some((employee) => employee.id === employeeId)) {
    throw new Error("La empleada no está asignada a tu equipo");
  }
}

async function assertOwnedService(serviceId: string) {
  const services = await getJefeServices();
  if (!services.some((service) => service.id === serviceId)) {
    throw new Error("El servicio no pertenece a tu equipo");
  }
}

export async function setEmployeeAvailability(employeeId: string, disponible: boolean) {
  try {
    await assertAssignedEmployee(employeeId);
    await apiFetch(`/employees/${employeeId}`, {
      method: "PATCH",
      body: JSON.stringify({ disponible }),
    });
    return { success: true };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { success: false, error: error instanceof Error ? error.message : "No se pudo actualizar" };
  }
}

export async function decidePendingService(
  serviceId: string,
  decision: "aceptar" | "rechazar",
  transportType: "chofer" | "uber" = "chofer",
  bossNotes?: string,
) {
  try {
    await assertOwnedService(serviceId);
    await apiFetch(`/services/${serviceId}/${decision}`, {
      method: "POST",
      body:
        decision === "aceptar"
          ? JSON.stringify({
              transportType,
              bossNotes: bossNotes?.trim() || undefined,
            })
          : undefined,
    });
    return { success: true };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { success: false, error: error instanceof Error ? error.message : "No se pudo procesar" };
  }
}

export async function updatePendingServiceAction(
  serviceId: string,
  data: {
    duracionPactadaHoras?: number;
    metodoPago?: "efectivo" | "tarjeta" | "transferencia" | "mixto";
    notas?: string;
  },
) {
  try {
    await assertOwnedService(serviceId);
    const updated = await apiFetch<Service>(`/services/${serviceId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    });
    return { success: true, data: updated };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo actualizar el servicio",
    };
  }
}

export async function refreshJefeServices() {
  return getJefeServices();
}

export async function cancelJefeService(serviceId: string) {
  try {
    await assertOwnedService(serviceId);
    await apiFetch(`/services/${serviceId}/cancel`, { method: "POST" });
    return { success: true };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      success: false,
      error: error instanceof Error ? error.message : "No se pudo cancelar el servicio",
    };
  }
}

export async function chooseReturnTransport(serviceId: string, transportType: "chofer" | "uber") {
  try {
    await assertOwnedService(serviceId);
    const data = await apiFetch(`/services/${serviceId}/return-transport`, {
      method: "POST",
      body: JSON.stringify({ transportType }),
    });
    return { success: true, data };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { success: false, error: error instanceof Error ? error.message : "No se pudo elegir el regreso" };
  }
}

export async function updateUberStatus(tripId: string, status: "en_camino" | "llegado") {
  try {
    await apiFetch(`/services/trips/${tripId}/uber-status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    return { success: true };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { success: false, error: error instanceof Error ? error.message : "No se pudo actualizar el Uber" };
  }
}

export async function confirmUberFare(tripId: string, amount: number) {
  try {
    await apiFetch(`/services/trips/${tripId}/uber-fare`, {
      method: "POST",
      body: JSON.stringify({ amount }),
    });
    return { success: true };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { success: false, error: error instanceof Error ? error.message : "No se pudo registrar la tarifa" };
  }
}

export async function changeTripTransport(
  tripId: string,
  transportType: 'chofer' | 'uber',
) {
  try {
    const data = await apiFetch(`/services/trips/${tripId}/transport`, {
      method: 'PATCH',
      body: JSON.stringify({ transportType }),
    });
    return { success: true, data };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'No se pudo cambiar el transporte',
    };
  }
}

export async function uploadUberScreenshot(formData: FormData) {
  try {
    const tripId = String(formData.get("tripId") || "");
    const file = formData.get("file");
    const payload = new FormData();
    if (!(file instanceof File)) throw new Error("Selecciona una imagen");
    payload.append("file", file);
    await apiFetch(`/services/trips/${tripId}/uber-screenshot`, { method: "POST", body: payload });
    return { success: true };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { success: false, error: error instanceof Error ? error.message : "No se pudo enviar la captura" };
  }
}

export async function getServiceMessages(serviceId: string): Promise<ConversationMessage[]> {
  await assertOwnedService(serviceId);
  const result = await apiFetch<{ messages: ConversationMessage[] }>(`/telegram-conversations/service/${serviceId}`);
  return result.messages;
}

export async function sendServiceMessage(serviceId: string, message: string) {
  try {
    await assertOwnedService(serviceId);
    const data = await apiFetch<ConversationMessage>(`/telegram-conversations/service/${serviceId}/messages`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    return { success: true, data };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { success: false, error: error instanceof Error ? error.message : "No se pudo enviar el mensaje" };
  }
}

export type GroupTransportUnitInput = {
  unitNumber: number;
  direction: "ida" | "regreso";
  provider: "chofer" | "uber";
  employeeIds: string[];
};

async function groupMutation<T = GroupServiceRequest>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
) {
  try {
    await requireJefe();
    const data = await apiFetch<T>(path, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { success: true as const, data };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo procesar el servicio grupal",
    };
  }
}

export async function getGroupServiceRequests() {
  await requireJefe();
  return apiFetch<GroupServiceRequest[]>("/group-services/requests");
}

export async function getGroupCandidates() {
  await requireJefe();
  return apiFetch<Employee[]>("/group-services/candidates");
}

export async function getGroupRequestMessages(requestId: string) {
  await requireJefe();
  return apiFetch<ConversationMessage[]>(
    `/group-services/requests/${requestId}/messages`,
  );
}

export async function sendGroupRequestMessage(
  requestId: string,
  message: string,
) {
  return groupMutation<ConversationMessage>(
    `/group-services/requests/${requestId}/messages`,
    "POST",
    { message },
  );
}

export async function updateGroupRequest(
  requestId: string,
  data: {
    durationHours?: number;
    paymentMethod?: "efectivo" | "tarjeta" | "transferencia" | "mixto";
    locationLat?: number;
    locationLng?: number;
    locationReference?: string;
  },
) {
  return groupMutation(`/group-services/requests/${requestId}`, "PATCH", data);
}

export async function requestGroupLocation(requestId: string) {
  return groupMutation<{ sent: boolean }>(
    `/group-services/requests/${requestId}/request-location`,
    "POST",
  );
}

export async function sendGroupCatalog(requestId: string) {
  return groupMutation(
    `/group-services/requests/${requestId}/catalog`,
    "POST",
  );
}

export async function reserveGroupEmployees(
  requestId: string,
  employeeIds: string[],
) {
  return groupMutation(
    `/group-services/requests/${requestId}/selections`,
    "PUT",
    { employeeIds, selectedBy: "jefe" },
  );
}

export async function extendGroupHold(requestId: string) {
  return groupMutation(
    `/group-services/requests/${requestId}/extend-hold`,
    "POST",
  );
}

export async function confirmGroupQuote(
  requestId: string,
  responsibleEmployeeId: string,
  transportUnits: GroupTransportUnitInput[],
) {
  return groupMutation<Service>(
    `/group-services/requests/${requestId}/confirm-quote`,
    "POST",
    { responsibleEmployeeId, transportUnits },
  );
}

export async function cancelGroupRequest(requestId: string) {
  return groupMutation<{ cancelled: boolean }>(
    `/group-services/requests/${requestId}`,
    "DELETE",
  );
}

export async function cancelGroupService(serviceId: string) {
  return groupMutation<{ cancelled: boolean }>(
    `/group-services/services/${serviceId}/cancel`,
    "POST",
  );
}

export async function startGroupService(serviceId: string) {
  return groupMutation<Service>(
    `/group-services/services/${serviceId}/start`,
    "POST",
  );
}

export async function addGroupParticipant(
  serviceId: string,
  employeeId: string,
  needsNewTransport: boolean,
  transportProvider: "chofer" | "uber",
) {
  return groupMutation<Service>(
    `/group-services/services/${serviceId}/participants`,
    "POST",
    { employeeId, needsNewTransport, transportProvider },
  );
}

export async function removeGroupParticipant(
  serviceId: string,
  employeeId: string,
  reason: string,
  manualTransportCharge?: number,
) {
  return groupMutation<Service>(
    `/group-services/services/${serviceId}/participants/${employeeId}`,
    "DELETE",
    { reason, manualTransportCharge },
  );
}

export async function changeGroupResponsible(
  serviceId: string,
  employeeId: string,
) {
  return groupMutation<Service>(
    `/group-services/services/${serviceId}/responsible`,
    "PUT",
    { employeeId },
  );
}

export async function changeGroupDuration(
  serviceId: string,
  durationHours: number,
) {
  return groupMutation<Service>(
    `/group-services/services/${serviceId}/duration`,
    "PATCH",
    { durationHours },
  );
}

export async function configureGroupTransports(
  serviceId: string,
  transportUnits: GroupTransportUnitInput[],
) {
  return groupMutation<Service>(
    `/group-services/services/${serviceId}/transports`,
    "PUT",
    { transportUnits },
  );
}

export async function addGroupManualTransportCharge(
  serviceId: string,
  amount: number,
  reason: string,
) {
  return groupMutation<Service>(
    `/group-services/services/${serviceId}/manual-transport-charge`,
    "POST",
    { amount, reason },
  );
}
