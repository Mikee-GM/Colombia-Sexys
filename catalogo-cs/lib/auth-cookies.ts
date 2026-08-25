import { cookies } from "next/headers";
import { parseSetCookieHeaders, type ParsedCookie } from "@/lib/set-cookie";

export async function applyBackendSetCookies(response: Response) {
  const cookieStore = await cookies();

  for (const { name, value, options } of parseSetCookieHeaders(response)) {
    cookieStore.set(name, value, options);
  }
}

/**
 * Escribe las cookies del backend directamente sobre una respuesta.
 *
 * Cuando un route handler devuelve una respuesta propia -- un redirect, por
 * ejemplo -- conviene no depender de que Next fusione lo escrito en `cookies()`
 * con esa respuesta: aqui van explicitas y no hay ambiguedad.
 */
export function copyBackendCookies(
  from: Response,
  to: {
    cookies: {
      set: (
        name: string,
        value: string,
        options?: ParsedCookie["options"],
      ) => unknown;
    };
  },
) {
  for (const { name, value, options } of parseSetCookieHeaders(from)) {
    to.cookies.set(name, value, options);
  }
}
