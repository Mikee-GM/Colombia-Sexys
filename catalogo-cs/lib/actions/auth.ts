"use server";

import { applyBackendSetCookies } from "@/lib/auth-cookies";
import {
  getBackendCookieHeader,
  getCsrfToken,
  getCurrentUser,
} from "@/lib/auth";
import { getApiBaseUrl } from "@/lib/api-server";

export async function loginAction(email: string, password: string) {
  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/login`, {
      method: "POST",
      body: JSON.stringify({ email, password }),
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || "Credenciales incorrectas");
    }

    if (!data.user || !["admin", "jefe"].includes(data.user.rol)) {
      return { success: false, error: "Tu cuenta no tiene acceso a este panel" };
    }
    await applyBackendSetCookies(response);

    return {
      success: true,
      redirectTo: data.user.rol === "jefe" ? "/jefe" : "/admin/dashboard",
    };
  } catch (error: unknown) {
    console.error("loginAction error:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Error de conexión con el servidor de autenticación",
    };
  }
}

export async function logoutAction() {
  const [cookie, csrfToken] = await Promise.all([
    getBackendCookieHeader(),
    getCsrfToken(),
  ]);
  const response = await fetch(`${getApiBaseUrl()}/auth/logout`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Cookie: cookie,
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
  });
  await applyBackendSetCookies(response);
  return { success: true };
}

export async function checkSessionAction() {
  return getCurrentUser();
}
