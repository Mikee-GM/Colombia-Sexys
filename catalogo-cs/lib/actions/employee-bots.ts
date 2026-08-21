"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { apiFetch } from "@/lib/api-server";

export type EmployeeBotStatus =
  | "pendiente"
  | "activo"
  | "error"
  | "deshabilitado";

/**
 * Lo único que el backend devuelve del bot de una modelo. El token nunca sale
 * de la base de datos: solo viajan sus últimos 4 caracteres para poder
 * mostrarlo enmascarado.
 */
export type EmployeeBot = {
  employeeId: string;
  status: EmployeeBotStatus;
  tokenHint: string | null;
  botUsername: string | null;
  lastError: string | null;
  updatedAt: string | null;
};

const CATALOG_CACHE_TAG = "catalog";

export async function getEmployeeBotsAction(): Promise<EmployeeBot[]> {
  try {
    return await apiFetch<EmployeeBot[]>("/telegram/bots", {
      authenticated: true,
    });
  } catch (error) {
    console.error("getEmployeeBotsAction error:", error);
    return [];
  }
}

export async function setEmployeeBotTokenAction(
  employeeId: string,
  token: string,
): Promise<{ ok: true; bot: EmployeeBot } | { ok: false; error: string }> {
  try {
    const bot = await apiFetch<EmployeeBot>(`/telegram/bots/${employeeId}`, {
      method: "PUT",
      body: JSON.stringify({ token: token.trim() }),
      authenticated: true,
    });
    revalidateTag(CATALOG_CACHE_TAG);
    revalidatePath("/admin/modelos");
    return { ok: true, bot };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo guardar el token del bot.";
    return { ok: false, error: message };
  }
}

export async function removeEmployeeBotAction(
  employeeId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await apiFetch<void>(`/telegram/bots/${employeeId}`, {
      method: "DELETE",
      authenticated: true,
    });
    revalidateTag(CATALOG_CACHE_TAG);
    revalidatePath("/admin/modelos");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "No se pudo quitar el bot.",
    };
  }
}
