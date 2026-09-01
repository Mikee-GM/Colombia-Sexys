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
  return avanzarViaje(tripId, "arrived", token);
}

/**
 * Marca que la empleada ya subio al coche.
 *
 * Cancela su margen de espera en el backend, asi que no es un boton inocente.
 */
export async function marcarRecogidaDelViaje(
  tripId: string,
  token?: string,
): Promise<{ success: boolean; error?: string }> {
  return avanzarViaje(tripId, "picked-up", token);
}

/**
 * Toma una oferta de viaje.
 *
 * La misma oferta va a varios choferes, asi que puede perderse la carrera. Eso
 * llega como `aceptado: false`, no como error: es una respuesta valida y la
 * pantalla debe decirlo con esas palabras.
 */
export async function aceptarOfertaDeViaje(
  tripId: string,
  token?: string,
): Promise<{ success: boolean; error?: string; aceptado?: boolean }> {
  const resultado = await avanzarViaje(tripId, "accept", token);
  return resultado;
}

/** Deja pasar una oferta, que se reofrece al siguiente chofer. */
export async function rechazarOfertaDeViaje(
  tripId: string,
  token?: string,
): Promise<{ success: boolean; error?: string }> {
  return avanzarViaje(tripId, "reject", token);
}

/** Cierra el viaje. Es la que dispara el recibo final del servicio. */
export async function finalizarElViaje(
  tripId: string,
  token?: string,
): Promise<{ success: boolean; error?: string }> {
  return avanzarViaje(tripId, "finished", token);
}

async function avanzarViaje(
  tripId: string,
  paso: "arrived" | "picked-up" | "finished" | "accept" | "reject",
  token?: string,
): Promise<{ success: boolean; error?: string; aceptado?: boolean }> {
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
      `${getApiBaseUrl()}/driver-portal/trips/${tripId}/${paso}`,
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
        error: err.message || "No se pudo marcar el avance del viaje",
      };
    }
    // `accept` responde si se gano la carrera; los demas pasos no dicen nada.
    const cuerpo = (await response.json().catch(() => ({}))) as {
      aceptado?: boolean;
    };
    return { success: true, aceptado: cuerpo.aceptado };
  } catch (error: any) {
    console.error("Error al marcar el avance del viaje:", error);
    return {
      success: false,
      error: error.message || "Error de conexión con el servidor",
    };
  }
}

/** Igual que en el portal de la modelo, con las cabeceras propias de este. */
export async function registrarMiUbicacion(
  lat: number,
  lng: number,
  token?: string,
): Promise<{ success: boolean }> {
  try {
    const cookie = await getBackendCookieHeader();
    const csrf = await getCsrfToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (cookie) headers["Cookie"] = cookie;
    if (csrf) headers["x-csrf-token"] = csrf;
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const url = new URL(`${getApiBaseUrl()}/driver-portal/location`);
    if (token) url.searchParams.set("token", token);

    const response = await fetch(url.toString(), {
      method: "POST",
      cache: "no-store",
      headers,
      body: JSON.stringify({ lat, lng }),
    });
    return { success: response.ok };
  } catch (error) {
    // Un envio perdido no se avisa: el siguiente lo corrige.
    console.error("Error al registrar la ubicacion:", error);
    return { success: false };
  }
}
