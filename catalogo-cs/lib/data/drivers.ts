import { apiFetch } from "@/lib/api-server";
import type { Driver, DriverKpi } from "@/lib/types";

export async function getDrivers() {
  return apiFetch<Driver[]>("/drivers");
}

export async function getDriver(id: string) {
  return apiFetch<Driver>(`/drivers/${id}`);
}

export async function getDriverKpis() {
  return apiFetch<DriverKpi[]>("/drivers/kpis");
}
