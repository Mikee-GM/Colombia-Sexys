"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";

export type GodEyeOverview = {
  metrics: {
    activeServices: number;
    employeesTotal: number;
    employeesAvailable: number;
    employeesBusy: number;
    driversTotal: number;
    driversActive: number;
    pendingReceipts: number;
    recentNegativeRatings: number;
    cashInStreet: number;
    activeSanctions: number;
    pendingAppeals: number;
  };
  activeServices: Array<{
    id: string;
    serviceType: "individual" | "grupal";
    estado: string;
    metodoPago: string;
    duracionPactadaHoras: number;
    precioBaseHoraPactado: number;
    totalFinal: number;
    iaActiva: boolean;
    horaInicioServicio: string | null;
    createdAt: string;
    notas: string | null;
    clienteId: string;
    clienteNombre: string;
    empleadaId: string;
    empleadaNombre: string;
    empleadaFoto: string | null;
    jefeId: string;
    jefeEmail: string;
  }>;
};

export type GodEyeActorSummary = {
  employees: Array<{
    id: string;
    name: string;
    type: "employee";
    disponible: boolean;
    precioBaseHora: number;
    avatar: string | null;
    jefeEmail: string | null;
    sancionada?: boolean;
    rankingPosition?: number | null;
    totalEmployees?: number;
    rankingScore?: number | null;
  }>;
  drivers: Array<{
    id: string;
    name: string;
    type: "driver";
    estado: string;
    disponible: boolean;
    telefono: string;
    vehiculoModelo: string;
    sancionada?: boolean;
  }>;
  bosses: Array<{
    id: string;
    name: string;
    email?: string;
    type: "boss";
    rol: string;
    activo: boolean;
    sancionada?: boolean;
  }>;
};

export type GodEyeActorDossier = {
  actorType: "employee" | "driver" | "boss";
  profile: any;
  ratings?: any[];
  ratingsSummary?: {
    client: {
      count: number;
      average: number;
      stars_5: number;
      stars_4: number;
      stars_3: number;
      stars_2: number;
      stars_1: number;
    };
    driver: {
      count: number;
      average: number;
      stars_5: number;
      stars_4: number;
      stars_3: number;
      stars_2: number;
      stars_1: number;
    };
  };
  ranking?: {
    position: number;
    total: number;
    score: number | null;
  } | null;
  reports?: any[];
  sanctions?: any[];
  services?: any[];
  servicesHistory?: any[];
  managedServices?: any[];
  trips?: any[];
  extras?: any[];
  cashObligations?: any[];
  finances?: {
    totalCashDue: number;
    totalDebt: number;
    totalOwed: number;
    cashObligations: any[];
    liquidationDebts: any[];
    recentSettlement?: any;
  };
  onboarding?: {
    id?: string;
    status: string;
    attemptCount?: number;
    bestScore?: number;
    trustScore?: number;
    assignedAt?: string;
    completedAt?: string;
    attempts?: Array<{
      id?: string;
      attemptNumber: number;
      status: string;
      score: number;
      correctAnswers: number;
      totalQuestions: number;
      startedAt?: string;
      completedAt?: string;
    }>;
    screening?: any;
  };
  weeklyPhotos?: any[];
  challenges?: any[];
  employees?: any[];
};

export type IncidentRootCause = {
  service: any;
  trips: any[];
  ratings: any[];
  reports: any[];
  conversations: any[];
  detectedCauses: Array<{
    category: string;
    culprit: "driver" | "employee" | "boss" | "client" | "system";
    confidence: "alta" | "media" | "baja";
    title: string;
    description: string;
  }>;
  triangulationSummary: {
    totalTrips: number;
    ratingsCount: number;
    reportsCount: number;
    chatMessagesCount: number;
    primaryDiagnosis: string;
  };
};

export async function getGodEyeOverviewAction(): Promise<GodEyeOverview> {
  return apiFetch<GodEyeOverview>("/admin/god-eye/overview");
}

export async function getGodEyeActorsAction(): Promise<GodEyeActorSummary> {
  return apiFetch<GodEyeActorSummary>("/admin/god-eye/actors");
}

export async function getGodEyeActorDossierAction(
  type: "employee" | "driver" | "boss",
  id: string,
): Promise<GodEyeActorDossier> {
  return apiFetch<GodEyeActorDossier>(`/admin/god-eye/actor/${type}/${id}`);
}

export async function getIncidentRootCauseAction(
  serviceId: string,
): Promise<IncidentRootCause> {
  return apiFetch<IncidentRootCause>(
    `/admin/god-eye/incident/${serviceId}/root-cause`,
  );
}

export async function pauseServiceAiAction(serviceId: string) {
  const result = await apiFetch<{ ok: boolean; iaActiva: boolean }>(
    `/telegram-conversations/service/${serviceId}/pause-ai`,
    { method: "POST" },
  );
  revalidatePath("/admin/dashboard");
  return result;
}

export async function resumeServiceAiAction(serviceId: string) {
  const result = await apiFetch<{ ok: boolean; iaActiva: boolean }>(
    `/telegram-conversations/service/${serviceId}/resume-ai`,
    { method: "POST" },
  );
  revalidatePath("/admin/dashboard");
  return result;
}

export async function sendAdminChatMessageAction(
  serviceId: string,
  message: string,
  asIdentity: "empleada" | "jefe" | "ia" = "jefe",
) {
  const result = await apiFetch(
    `/telegram-conversations/service/${serviceId}/admin-message`,
    {
      method: "POST",
      body: JSON.stringify({ message, asIdentity }),
    },
  );
  revalidatePath("/admin/dashboard");
  return result;
}

export async function updateActorQuickSettingsAction(
  type: "employee" | "driver" | "boss",
  id: string,
  payload: Record<string, any>,
) {
  if (type === "employee") {
    await apiFetch(`/employees/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  } else if (type === "driver") {
    await apiFetch(`/drivers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }
  revalidatePath("/admin/dashboard");
  return { ok: true };
}
