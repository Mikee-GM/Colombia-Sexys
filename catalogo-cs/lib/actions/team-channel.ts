"use server";

import { apiFetch } from "@/lib/api-server";
import { isRedirectError } from "@/lib/auth";
import type { MensajeDelCanalJefe } from "@/lib/types";

/**
 * Canal con una modelo, desde el lado de quien la coordina.
 *
 * El anonimato solo corre hacia ella: aquí sí se ve con quién se habla, porque
 * coordinar sin saber a quién se le escribe no tiene sentido. Lo que el backend
 * nunca manda es el camino contrario.
 *
 * Quién puede abrir el canal de cada modelo lo decide el backend: un jefe solo
 * el de las suyas, un admin el de cualquiera.
 */
export async function leerCanalDeModelo(
  empleadaId: string,
): Promise<{ success: boolean; mensajes: MensajeDelCanalJefe[]; error?: string }> {
  try {
    const mensajes = await apiFetch<MensajeDelCanalJefe[]>(
      `/team-channel/${empleadaId}`,
    );
    return { success: true, mensajes };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      success: false,
      mensajes: [],
      error:
        error instanceof Error ? error.message : "No se pudo abrir el canal",
    };
  }
}

/** Escribe a una modelo. Le llega por su portal y por el bot, sin tu nombre. */
export async function escribirAModelo(empleadaId: string, cuerpo: string) {
  const texto = cuerpo.trim();
  if (!texto) return { success: false as const, error: "Escribe algo primero" };

  try {
    const mensaje = await apiFetch<MensajeDelCanalJefe>(
      `/team-channel/${empleadaId}`,
      { method: "POST", body: JSON.stringify({ cuerpo: texto }) },
    );
    return { success: true as const, mensaje };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      success: false as const,
      error:
        error instanceof Error ? error.message : "No se pudo enviar el mensaje",
    };
  }
}

/**
 * Le pregunta por qué cerró su jornada.
 *
 * La pregunta sale por el canal para que la respuesta tenga a dónde volver:
 * antes el jefe se enteraba de que alguien había cerrado su día y no tenía
 * forma de preguntar sin salirse del sistema.
 */
export async function preguntarMotivoDeJornada(empleadaId: string) {
  try {
    await apiFetch(`/team-channel/${empleadaId}/preguntar-jornada`, {
      method: "POST",
    });
    return { success: true as const };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return {
      success: false as const,
      error:
        error instanceof Error ? error.message : "No se pudo preguntar",
    };
  }
}

/** Cuántos mensajes sin leer tiene cada modelo, para marcarlo en la lista. */
export async function getCanalSinLeer(): Promise<Record<string, number>> {
  try {
    return await apiFetch<Record<string, number>>("/team-channel/unread");
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("getCanalSinLeer error:", error);
    return {};
  }
}
