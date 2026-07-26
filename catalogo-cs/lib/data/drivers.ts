import { apiFetch } from "@/lib/api-server";
import type { Driver } from "@/lib/types";

export async function getDrivers() {
  return apiFetch<Driver[]>("/drivers");
}

export async function getDriver(id: string) {
  return apiFetch<Driver>(`/drivers/${id}`);
}
