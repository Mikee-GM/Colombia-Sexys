"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api-server";
import { getCurrentUser } from "@/lib/auth";
import type { SolicitudServicioManual } from "@/lib/types";

/**
 * Solicitudes de registro de un servicio ocurrido fuera del sistema.
 *
 * El camino normal es el chat: la empleada la levanta desde Telegram y su jefe
 * la autoriza ahi mismo. Esta pantalla es para revisarlas con calma y para que
 * quede una via cuando el chat falla, asi que no duplica ninguna regla: el
 * backend ya filtra por rol --un jefe solo ve las de sus empleadas-- y es el
 * unico que decide quien puede resolverlas.
 */
async function requireOffice() {
  const user = await getCurrentUser();
  if (!user || !["admin", "jefe"].includes(user.rol)) {
    throw new Error("Acceso no autorizado");
  }
  return user;
}

export async function getSolicitudesManuales(
  estado?: string,
): Promise<SolicitudServicioManual[]> {
  await requireOffice();
  const params = estado ? `?estado=${encodeURIComponent(estado)}` : "";
  return apiFetch<SolicitudServicioManual[]>(`/manual-services${params}`, {
    authenticated: true,
  });
}

async function resolver(
  id: string,
  accion: "aprobar" | "rechazar",
  nota: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireOffice();
    await apiFetch(`/manual-services/${id}/${accion}`, {
      method: "POST",
      body: JSON.stringify({ nota }),
      authenticated: true,
    });
    revalidatePath("/admin/servicios-manuales");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo resolver la solicitud",
    };
  }
}

export async function aprobarSolicitudManual(id: string, nota: string) {
  return resolver(id, "aprobar", nota);
}

export async function rechazarSolicitudManual(id: string, nota: string) {
  return resolver(id, "rechazar", nota);
}
