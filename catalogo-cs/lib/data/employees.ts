import { apiFetch } from "@/lib/api-server";
import type { Employee, EmployeeKpi } from "@/lib/types";

export async function getEmployees() {
  return apiFetch<Employee[]>("/employees");
}

export async function getEmployee(id: string) {
  return apiFetch<Employee>(`/employees/${id}`);
}

export async function getEmployeeKpis() {
  return apiFetch<EmployeeKpi[]>("/employees/kpis");
}
