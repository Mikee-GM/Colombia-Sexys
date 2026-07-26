import { apiFetch } from "@/lib/api-server";
import type { Service, ServiceStatus } from "@/lib/types";

export const activeServiceStatuses: ServiceStatus[] = ["en_curso"];

export function isActiveService(service: Service) {
  return activeServiceStatuses.includes(service.estado);
}

// TODO: verificar si GET /services existe en el backend
export async function getServices() {
  return apiFetch<Service[]>("/services");
}

// TODO: verificar si GET /services/pendientes existe en el backend
export async function getPendingServices() {
  return apiFetch<Service[]>("/services/pendientes");
}
