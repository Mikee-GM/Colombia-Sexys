"use server";

import { getApiBaseUrl } from "@/lib/api-server";
import { getBackendCookieHeader, getCsrfToken } from "@/lib/auth";
import type { DriverPortalData } from "@/lib/types";

export async function getDriverPortalData(
  token?: string,
): Promise<{ success: boolean; data?: DriverPortalData; error?: string }> {
  try {
    const cookie = await getBackendCookieHeader();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (cookie) {
      headers["Cookie"] = cookie;
    }
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const url = new URL(`${getApiBaseUrl()}/driver-portal/me`);
    if (token) {
      url.searchParams.set("token", token);
    }

    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      headers,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        error: err.message || "Error al cargar la información del portal",
      };
    }

    const data = (await response.json()) as DriverPortalData;
    return { success: true, data };
  } catch (error: any) {
    console.error("Error al obtener datos del portal de chofer:", error);
    return {
      success: false,
      error: error.message || "Error de conexión con el servidor",
    };
  }
}

/**
 * Marca que el chofer ya llego al punto de recogida.
 *
 * Mismo camino que el boton del chat: los dos llaman a `DriverTripsService`,
 * asi que no pueden divergir. El `x-csrf-token` acompana a la cookie porque el
 * backend no se fia solo de `SameSite` para las mutaciones del portal; cuando
 * se entra por el enlace del bot no hay cookie y tampoco hace falta.
 */
export async function marcarLlegadaDelViaje(
  tripId: string,
  token?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const cookie = await getBackendCookieHeader();
    const csrf = await getCsrfToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (cookie) headers["Cookie"] = cookie;
    if (csrf) headers["x-csrf-token"] = csrf;
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const url = new URL(
      `${getApiBaseUrl()}/driver-portal/trips/${tripId}/arrived`,
    );
    if (token) url.searchParams.set("token", token);

    const response = await fetch(url.toString(), {
      method: "POST",
      cache: "no-store",
      headers,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return {
        success: false,
        error: err.message || "No se pudo marcar la llegada",
      };
    }
    return { success: true };
  } catch (error: any) {
    console.error("Error al marcar la llegada del chofer:", error);
    return {
      success: false,
      error: error.message || "Error de conexión con el servidor",
    };
  }
}
