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
    sancionada?: boolean;
    vehiculoMarca?: string;
    vehiculoModelo?: string;
    vehiculoColor?: string;
    vehiculoPlaca?: string;
    trustScore?: number | null;
    disponible: boolean;
    /** Con chat vinculado, recibe por Telegram; sin el, no le llega nada. */
    telegramChatId?: string | null;
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
      sancionada: Boolean(d.sancionada),
      vehiculoMarca: d.vehiculoMarca || "",
      vehiculoModelo: d.vehiculoModelo || "",
      vehiculoColor: d.vehiculoColor || "",
      vehiculoPlaca: d.vehiculoPlaca || "",
      trustScore: trustScores[d.usuarioId] ?? null,
      disponible: Boolean(d.disponible),
      telegramChatId: d.usuario?.telegramChatId ?? null,
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

/**
 * Marca al chofer como disponible o no disponible desde el panel de admin.
 *
 * La disponibilidad decide si entra en el reparto de viajes, pero solo se podia
 * mover desde su propio portal: cuando alguien se quedaba marcado como ocupado
 * por un viaje que nunca se cerro, no habia forma de sacarlo de ahi sin tocar la
 * base a mano.
 *
 * Va aparte de `updateChoferAction` a proposito: esa manda el formulario
 * entero, y usarla para un interruptor obligaria a acarrear el nombre, el
 * correo y el vehiculo en cada toque.
 */
export async function setChoferDisponibilidadAction(
  id: string,
  disponible: boolean,
): Promise<{ success: boolean; error?: string }> {
  try {
    await apiFetch(`/drivers/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ disponible }),
      authenticated: true,
    });
    return { success: true };
  } catch (error: any) {
    if (isRedirectError(error)) throw error;
    console.error("setChoferDisponibilidadAction error:", error);
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
