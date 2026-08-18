"use server";

import { getApiBaseUrl } from "@/lib/api-server";
import { getBackendCookieHeader } from "@/lib/auth";
import type { EmployeePortalData } from "@/lib/types";

export async function getEmployeePortalData(
  token?: string,
): Promise<{ success: boolean; data?: EmployeePortalData; error?: string }> {
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

    const url = new URL(`${getApiBaseUrl()}/employee-portal/me`);
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

    const data = (await response.json()) as EmployeePortalData;
    return { success: true, data };
  } catch (error: any) {
    console.error("Error al obtener datos del portal de empleada:", error);
    return {
      success: false,
      error: error.message || "Error de conexión con el servidor",
    };
  }
}
