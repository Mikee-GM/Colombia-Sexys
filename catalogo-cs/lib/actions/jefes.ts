"use server";

import { apiFetch } from "@/lib/api-server";
import { isRedirectError } from "@/lib/auth";
import { getStaffTrustScores } from "@/lib/staff-reliability";

export async function getJefesAction(): Promise<{ id: string; email: string; nombre?: string | null; apellido?: string | null; trustScore?: number | null }[]> {
  try {
    const [users, trustScores] = await Promise.all([
      apiFetch<any[]>("/users?rol=jefe", {
        authenticated: true,
      }),
      getStaffTrustScores(),
    ]);

    return users.map((u: any) => ({
      id: u.id,
      email: u.email,
      nombre: u.nombre,
      apellido: u.apellido,
      trustScore: trustScores[u.id] ?? null,
    }));
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("getJefesAction error:", error);
    return [];
  }
}

export async function createJefeAction(
  nombre: string,
  apellido: string,
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await apiFetch("/users", {
      method: "POST",
      body: JSON.stringify({ nombre, apellido, email, password, rol: "jefe" }),
      authenticated: true,
    });

    return { success: true };
  } catch (error: any) {
    if (isRedirectError(error)) throw error;
    console.error("createJefeAction error:", error);
    return { success: false, error: error.message || "Error de conexion con el servidor" };
  }
}

export async function updateJefeAction(
  id: string,
  nombre: string,
  apellido: string,
  email: string,
  password?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const body: any = { nombre, apellido, email };
    if (password && password.trim() !== "") {
      body.password = password;
    }

    await apiFetch(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      authenticated: true,
    });

    return { success: true };
  } catch (error: any) {
    if (isRedirectError(error)) throw error;
    console.error("updateJefeAction error:", error);
    return { success: false, error: error.message || "Error de conexion con el servidor" };
  }
}

export async function deleteJefeAction(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    await apiFetch(`/users/${id}`, {
      method: "DELETE",
      authenticated: true,
    });

    return { success: true };
  } catch (error: any) {
    if (isRedirectError(error)) throw error;
    console.error("deleteJefeAction error:", error);
    return { success: false, error: error.message || "Error de conexion con el servidor" };
  }
}

// TODO: verificar si POST /users/{id}/telegram-otp existe en el backend
export async function generateTelegramOtpAction(id: string): Promise<{ success: boolean; code?: string; expiresAt?: string; error?: string }> {
  try {
    const data = await apiFetch<any>(`/users/${id}/telegram-otp`, {
      method: "POST",
      authenticated: true,
    });
    return { success: true, code: data.code, expiresAt: data.expiresAt };
  } catch (error: any) {
    if (isRedirectError(error)) throw error;
    console.error("generateTelegramOtpAction error:", error);
    return { success: false, error: error.message || "Error de conexion con el servidor" };
  }
}
