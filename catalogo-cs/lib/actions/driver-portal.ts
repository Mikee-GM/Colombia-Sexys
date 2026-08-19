"use server";

import { getApiBaseUrl } from "@/lib/api-server";
import { getBackendCookieHeader } from "@/lib/auth";
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
