"use client";

import { refreshSession } from "@/lib/client-session";

/** La cookie CSRF, que no es httpOnly justamente para poder leerla desde aqui. */
export function leerCsrf(): string {
  const prefijo = "csrf_token=";
  return (
    document.cookie
      .split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(prefijo))
      ?.slice(prefijo.length) ?? ""
  );
}

/**
 * Llama al backend renovando la sesion si hace falta.
 *
 * El middleware renueva el access token al navegar a una pagina, pero las
 * peticiones que el navegador hace a `/api/*` se reenvian al backend tal cual,
 * sin pasar por ese bloque. Como el access token dura poco, cualquier pantalla
 * que lleve un rato abierta se lleva un 401 al primer clic, y desde fuera
 * parece que la funcion esta rota.
 *
 * Ante un 401 se renueva una vez y se repite. Si la renovacion tampoco vale,
 * la sesion termino de verdad y hay que volver a entrar.
 */
export async function pedirConSesion(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const opciones: RequestInit = {
    ...init,
    credentials: "same-origin",
    headers: { ...(init.headers ?? {}), "x-csrf-token": leerCsrf() },
  };

  const respuesta = await fetch(url, opciones);
  if (respuesta.status !== 401) return respuesta;

  const renovada = await refreshSession();
  if (renovada !== "refreshed") return respuesta;

  // El CSRF se vuelve a leer: la renovacion emite una cookie nueva.
  return fetch(url, {
    ...opciones,
    headers: { ...(init.headers ?? {}), "x-csrf-token": leerCsrf() },
  });
}
