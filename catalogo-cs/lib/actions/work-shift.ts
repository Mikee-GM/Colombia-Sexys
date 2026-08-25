"use server";

import { revalidatePath } from "next/cache";
import { apiFetch } from "@/lib/api-server";
import { isRedirectError } from "@/lib/auth";

export type WorkShiftStatus = {
  enJornada: boolean;
  jornadaActualizadaAt: string | null;
};

export type OffDutyPerson = {
  id: string;
  rol: "jefe" | "empleada" | "chofer" | "admin";
  nombre: string;
  email: string;
  jornadaActualizadaAt: string | null;
};

export async function getMyWorkShift(): Promise<WorkShiftStatus | null> {
  try {
    return await apiFetch<WorkShiftStatus>("/users/me/jornada");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("getMyWorkShift error:", error);
    return null;
  }
}

/**
 * Cierra o reabre la jornada de quien lo pide. El backend decide a quien avisa
 * segun el rol: al jefe si es una modelo, al panel de admin si no.
 */
export async function setMyWorkShift(enJornada: boolean) {
  try {
    const status = await apiFetch<WorkShiftStatus>("/users/me/jornada", {
      method: "PATCH",
      body: JSON.stringify({ enJornada }),
    });
    revalidatePath("/jefe");
    revalidatePath("/admin/dashboard");
    return { success: true as const, status };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      success: false as const,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo cambiar tu estado de jornada",
    };
  }
}

/** Personal fuera de jornada, para marcarlo en el panel de admin. */
export async function getOffDutyStaff(): Promise<OffDutyPerson[]> {
  try {
    return await apiFetch<OffDutyPerson[]>("/users/off-duty");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("getOffDutyStaff error:", error);
    return [];
  }
}
