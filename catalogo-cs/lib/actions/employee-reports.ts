"use server";

import { apiFetch } from "@/lib/api-server";
import { getCurrentUser, isRedirectError } from "@/lib/auth";
import type {
  ApiUser,
  EmployeeReport,
  EmployeeReportFilters,
  EmployeeReportPriority,
  EmployeeReportsPage,
  EmployeeReportSummary,
  EmployeeTolerance,
} from "@/lib/types";

async function requireReportsReader() {
  const user = await getCurrentUser();
  if (!user || !["admin", "jefe"].includes(user.rol)) {
    throw new Error("Acceso no autorizado");
  }
  return user;
}

async function requireAdmin() {
  const user = await requireReportsReader();
  if (user.rol !== "admin") throw new Error("Esta acción requiere permisos de admin");
  return user;
}

function reportsQuery(filters: EmployeeReportFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== "") params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function getEmployeeReports(filters: EmployeeReportFilters = {}) {
  await requireReportsReader();
  const result = await apiFetch<EmployeeReportsPage>(
    `/employee-reports${reportsQuery(filters)}`,
  );
  return Array.isArray(result)
    ? { items: [], total: 0, page: filters.page ?? 1, limit: filters.limit ?? 20, pages: 0 }
    : result;
}

export async function getEmployeeReportDashboard() {
  await requireReportsReader();
  const [summary, tolerance] = await Promise.all([
    apiFetch<EmployeeReportSummary>("/employee-reports/dashboard-summary"),
    apiFetch<EmployeeTolerance[]>("/employee-reports/tolerance"),
  ]);
  return {
    summary: Array.isArray(summary)
      ? { newCases: 0, urgentCases: 0, employeesOverTolerance: 0 }
      : summary,
    tolerance: Array.isArray(tolerance) ? tolerance : [],
  };
}

export async function getEmployeeReportDetail(id: string) {
  await requireReportsReader();
  const report = await apiFetch<EmployeeReport>(`/employee-reports/${id}`);
  if (Array.isArray(report) || !report?.id) {
    throw new Error("No se pudo cargar el reporte");
  }
  return report;
}

export async function getReportAdmins() {
  const user = await requireReportsReader();
  if (user.rol !== "admin") return [];
  const admins = await apiFetch<ApiUser[]>("/users?rol=admin");
  return Array.isArray(admins) ? admins.filter((admin) => admin.activo !== false) : [];
}

async function reportMutation(path: string, method: "POST" | "PATCH", body?: object) {
  try {
    await requireAdmin();
    const data = await apiFetch<EmployeeReport>(path, {
      method,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { success: true as const, data };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      success: false as const,
      error: error instanceof Error ? error.message : "No se pudo actualizar el reporte",
    };
  }
}

export async function takeEmployeeReport(id: string) {
  return reportMutation(`/employee-reports/${id}/take`, "POST");
}

export async function assignEmployeeReport(id: string, adminId: string) {
  return reportMutation(`/employee-reports/${id}/assign`, "PATCH", { adminId });
}

export async function changeEmployeeReportPriority(
  id: string,
  priority: EmployeeReportPriority,
) {
  return reportMutation(`/employee-reports/${id}/priority`, "PATCH", { priority });
}

export async function startEmployeeReportReview(id: string) {
  return reportMutation(`/employee-reports/${id}/start-review`, "POST");
}

export async function addEmployeeReportNote(id: string, note: string) {
  return reportMutation(`/employee-reports/${id}/notes`, "POST", { note });
}

export async function closeEmployeeReport(
  id: string,
  action: "resolve" | "dismiss",
  resolution: string,
) {
  return reportMutation(`/employee-reports/${id}/${action}`, "POST", { resolution });
}
