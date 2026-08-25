"use server";

import { apiFetch } from "@/lib/api-server";
import { isRedirectError } from "@/lib/auth";
import type { Regulation, StaffOnboarding } from "@/lib/types";

/** Roles que tienen reglamento propio. */
const ROLES = ["empleada", "chofer", "jefe"] as const;

/** Estado del reglamento de cada persona del staff. */
export async function getStaffOnboarding() {
  return apiFetch<StaffOnboarding[]>("/employee-onboarding/staff");
}

/**
 * Reglamento vigente de cada rol.
 *
 * El backend responde por rol, no en lote, asi que se piden los tres en
 * paralelo. Un rol sin reglamento publicado responde con error y se resuelve
 * como null en lugar de tumbar la pantalla.
 */
export async function getRegulations() {
  const entries = await Promise.all(
    ROLES.map(async (targetRole) => {
      try {
        const regulation = await apiFetch<Regulation | null>(
          `/employee-onboarding/regulation?targetRole=${targetRole}`,
        );
        return { targetRole, regulation: regulation ?? null };
      } catch (error) {
        if (isRedirectError(error)) throw error;
        return { targetRole, regulation: null };
      }
    }),
  );

  return entries;
}
