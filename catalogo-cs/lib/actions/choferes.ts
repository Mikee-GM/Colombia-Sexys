"use server";

import { apiFetch } from "@/lib/api-server";
import { isRedirectError } from "@/lib/auth";
import { getStaffTrustScores } from "@/lib/staff-reliability";

export async function getChoferesAction(): Promise<
  {
    id: string;
    nombre: string;
    telefono: string;
    email: string;
    usuarioId: string;
    vehiculoMarca?: string;
    vehiculoModelo?: string;
    vehiculoColor?: string;
    vehiculoPlaca?: string;
    trustScore?: number | null;
  }[]
> {
  try {
    const [drivers, trustScores] = await Promise.all([
      apiFetch<any[]>("/drivers", {
        authenticated: true,
      }),
      getStaffTrustScores(),
    ]);

    return drivers.map((d: any) => ({
      id: d.id,
      nombre: d.nombre,
      telefono: d.telefono,
      email: d.usuario?.email || "",
      usuarioId: d.usuarioId,
      vehiculoMarca: d.vehiculoMarca || "",
      vehiculoModelo: d.vehiculoModelo || "",
      vehiculoColor: d.vehiculoColor || "",
      vehiculoPlaca: d.vehiculoPlaca || "",
      trustScore: trustScores[d.usuarioId] ?? null,
    }));
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("getChoferesAction error:", error);
    return [];
  }
}

export async function createChoferAction(
  nombre: string,
  telefono: string,
  email: string,
  password: string,
  vehiculoMarca?: string,
  vehiculoModelo?: string,
  vehiculoColor?: string,
  vehiculoPlaca?: string,
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const res = await apiFetch<any>("/drivers", {
      method: "POST",
      body: JSON.stringify({
        nombre,
        telefono,
        email,
        password,
        vehiculoMarca: vehiculoMarca || null,
        vehiculoModelo: vehiculoModelo || null,
        vehiculoColor: vehiculoColor || null,
        vehiculoPlaca: vehiculoPlaca || null,
      }),
      authenticated: true,
    });

    return {
      success: true,
      data: {
        id: res.id,
        nombre: res.nombre,
        telefono: res.telefono,
        email: res.usuario?.email || email,
        usuarioId: res.usuarioId,
        vehiculoMarca: res.vehiculoMarca || "",
        vehiculoModelo: res.vehiculoModelo || "",
        vehiculoColor: res.vehiculoColor || "",
        vehiculoPlaca: res.vehiculoPlaca || "",
      },
    };
  } catch (error: any) {
    if (isRedirectError(error)) throw error;
    console.error("createChoferAction error:", error);
    return {
      success: false,
      error: error.message || "Error de conexion con el servidor",
    };
  }
}

export async function updateChoferAction(
  id: string,
  nombre: string,
  telefono: string,
  email: string,
  password?: string,
  vehiculoMarca?: string,
  vehiculoModelo?: string,
  vehiculoColor?: string,
  vehiculoPlaca?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const body: any = {
      nombre,
      telefono,
      email,
      vehiculoMarca: vehiculoMarca || null,
      vehiculoModelo: vehiculoModelo || null,
      vehiculoColor: vehiculoColor || null,
      vehiculoPlaca: vehiculoPlaca || null,
    };
    if (password && password.trim() !== "") {
      body.password = password;
    }

    await apiFetch(`/drivers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
      authenticated: true,
    });

    return { success: true };
  } catch (error: any) {
    if (isRedirectError(error)) throw error;
    console.error("updateChoferAction error:", error);
    return {
      success: false,
      error: error.message || "Error de conexion con el servidor",
    };
  }
}

export async function deleteChoferAction(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await apiFetch(`/drivers/${id}`, {
      method: "DELETE",
      authenticated: true,
    });

    return { success: true };
  } catch (error: any) {
    if (isRedirectError(error)) throw error;
    console.error("deleteChoferAction error:", error);
    return {
      success: false,
      error: error.message || "Error de conexion con el servidor",
    };
  }
}
