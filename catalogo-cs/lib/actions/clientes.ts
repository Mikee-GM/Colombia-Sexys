"use server";

import { revalidatePath } from "next/cache";

import { apiFetch } from "@/lib/api-server";
import { getCurrentUser } from "@/lib/auth";
import type { ClientDossier, ClientesPage } from "@/lib/types";

/**
 * La ficha de un cliente la abre quien esta decidiendo algo sobre el: si
 * atenderlo, si bloquearlo, cuanto vale. Por eso la leen jefe y admin, y el
 * bloqueo lo puede aplicar cualquiera de los dos.
 */
async function requireOffice() {
  const user = await getCurrentUser();
  if (!user || !["admin", "jefe"].includes(user.rol)) {
    throw new Error("Acceso no autorizado");
  }
  return user;
}

export async function getClientes(
  search?: string,
  limit = 50,
  offset = 0,
): Promise<ClientesPage> {
  await requireOffice();
  const params = new URLSearchParams();
  if (search?.trim()) params.set("search", search.trim());
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  return apiFetch<ClientesPage>(`/clients?${params.toString()}`, {
    authenticated: true,
  });
}

export async function getClienteFicha(id: string): Promise<ClientDossier> {
  await requireOffice();
  return apiFetch<ClientDossier>(`/clients/${id}/ficha`, {
    authenticated: true,
  });
}

export async function bloquearClienteAction(
  id: string,
  reason: string,
  endsAt?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireOffice();
    await apiFetch(`/clients/${id}/bloqueo`, {
      method: "POST",
      body: JSON.stringify({ reason, ...(endsAt ? { endsAt } : {}) }),
      authenticated: true,
    });
    revalidatePath(`/admin/clientes/${id}`);
    revalidatePath("/admin/clientes");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "No se pudo bloquear al cliente.",
    };
  }
}

export async function desbloquearClienteAction(
  id: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireOffice();
    await apiFetch(`/clients/${id}/bloqueo`, {
      method: "DELETE",
      body: JSON.stringify({ reason }),
      authenticated: true,
    });
    revalidatePath(`/admin/clientes/${id}`);
    revalidatePath("/admin/clientes");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "No se pudo levantar el bloqueo.",
    };
  }
}
