"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";
import type { EmployeeRatingComment } from "@/lib/types";

export type PersonType = "client" | "employee" | "driver" | "boss";
export type RatingDirection =
  | "client_to_employee"
  | "employee_to_client"
  | "driver_to_employee"
  | "employee_to_driver";

export type ConductReport = {
  id: string;
  direction: RatingDirection;
  reporterType: PersonType;
  reporterId: string;
  subjectType: PersonType;
  subjectId: string;
  serviceId: string | null;
  tripId: string | null;
  category: string;
  description: string;
  priority: "normal" | "alta" | "urgente";
  status: "nuevo" | "en_revision" | "cerrado";
  outcome: "confirmado" | "no_sustentado" | null;
  resolution: string | null;
  createdAt: string;
};

export type DisciplinarySanction = {
  id: string;
  subjectType: PersonType;
  subjectId: string;
  type: "suspension" | "permanent_ban" | "fine";
  status: "active" | "revoked" | "expired";
  reason: string;
  fineAmount?: number | null;
  startsAt: string;
  endsAt: string | null;
  createdAt: string;
};

export type RatingAppeal = {
  id: string;
  direction: RatingDirection;
  stars: number;
  comment: string | null;
  appealStatus: "none" | "pending" | "upheld" | "overturned";
  appealReason: string | null;
  createdAt: string;
};

export type Dossier = {
  subjectType: PersonType;
  subjectId: string;
  ratings: Array<{
    direction: RatingDirection;
    average: number;
    count: number;
  }>;
  reports: ConductReport[];
  sanctions: DisciplinarySanction[];
};

export async function getConductReports() {
  return apiFetch<ConductReport[]>("/discipline/reports");
}

export async function getSanctions() {
  return apiFetch<DisciplinarySanction[]>("/discipline/sanctions");
}

export async function getDossier(subjectType: PersonType, subjectId: string) {
  return apiFetch<Dossier>(
    `/discipline/dossiers/${subjectType}/${subjectId}`,
  );
}

export async function getEmployeeRatingComments(employeeId: string) {
  return apiFetch<EmployeeRatingComment[]>(
    `/discipline/ratings/employee/${employeeId}`,
  );
}

export async function closeConductReport(
  id: string,
  outcome: "confirmado" | "no_sustentado",
  resolution: string,
) {
  await apiFetch(`/discipline/reports/${id}/close`, {
    method: "POST",
    body: JSON.stringify({ outcome, resolution }),
  });
  revalidatePath("/admin/reports");
  revalidatePath("/jefe/reportes");
}

export async function createSanction(input: {
  subjectType: PersonType;
  subjectId: string;
  type: "suspension" | "permanent_ban" | "fine";
  reason: string;
  fineAmount?: number;
  conductReportId?: string;
  startsAt?: string;
  endsAt?: string;
}) {
  await apiFetch("/discipline/sanctions", {
    method: "POST",
    body: JSON.stringify(input),
  });
  revalidatePath("/admin/reports");
}

export async function revokeSanction(id: string, reason: string) {
  await apiFetch(`/discipline/sanctions/${id}/revoke`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  revalidatePath("/admin/reports");
}

export async function getPendingAppeals() {
  return apiFetch<RatingAppeal[]>("/discipline/appeals");
}

export async function resolveAppeal(
  id: string,
  decision: "upheld" | "overturned",
) {
  await apiFetch(`/discipline/appeals/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
  revalidatePath("/admin/reports");
}
