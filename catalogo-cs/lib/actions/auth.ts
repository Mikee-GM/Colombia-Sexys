"use server";

import { applyBackendSetCookies } from "@/lib/auth-cookies";
import {
  getBackendCookieHeader,
  getCsrfToken,
  getCurrentUser,
  isRedirectError,
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

export async function getMyProfileAction() {
  return getCurrentUser();
}

export async function updateMyProfileAction(input: {
  nombre?: string;
  apellido?: string;
  email?: string;
  password?: string;
}) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Sesión no válida o expirada" };
    }

    const body: Record<string, any> = {};
    if (input.nombre !== undefined) body.nombre = input.nombre.trim();
    if (input.apellido !== undefined) body.apellido = input.apellido.trim();
    if (input.email !== undefined && input.email.trim()) body.email = input.email.trim();
    if (input.password && input.password.trim().length > 0) {
      if (input.password.trim().length < 6) {
        return { success: false, error: "La contraseña debe tener al menos 6 caracteres" };
      }
      body.password = input.password.trim();
    }

    const { apiFetch } = await import("@/lib/api-server");
    await apiFetch(`/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      authenticated: true,
    });

    return { success: true };
  } catch (error: any) {
    if (isRedirectError(error)) throw error;
    console.error("updateMyProfileAction error:", error);
    return {
      success: false,
      error: error.message || "Error al actualizar los datos de perfil",
    };
  }
}
