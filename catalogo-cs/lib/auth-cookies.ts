import { cookies } from "next/headers";

type CookieSameSite = "lax" | "strict" | "none";

function getSetCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  return headers.getSetCookie?.() ?? [];
}

type ParsedCookie = {
  name: string;
  value: string;
  options: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: CookieSameSite;
    path?: string;
    domain?: string;
    maxAge?: number;
    expires?: Date;
  };
};

/**
 * Traduce las cabeceras Set-Cookie del backend a la forma que espera Next.
 *
 * Dejamos que Next infiera "Secure" segun si la conexion es HTTPS, e ignoramos
 * el "Domain" del backend para que el navegador asocie la cookie al host
 * actual, que puede ser una IP.
 */
function parseBackendCookies(response: Response): ParsedCookie[] {
  const parsed: ParsedCookie[] = [];

  for (const header of getSetCookieHeaders(response)) {
    const parts = header.split(";").map((part) => part.trim());
    const separator = parts[0].indexOf("=");
    if (separator < 1) continue;

    const options: ParsedCookie["options"] = {};

    for (const attribute of parts.slice(1)) {
      const [rawKey, ...rawValue] = attribute.split("=");
      const key = rawKey.toLowerCase();
      const attributeValue = rawValue.join("=");
      if (key === "httponly") options.httpOnly = true;
      if (key === "path") options.path = attributeValue;
      if (key === "max-age") options.maxAge = Number(attributeValue);
      if (key === "expires") options.expires = new Date(attributeValue);
      if (key === "samesite") {
        options.sameSite = attributeValue.toLowerCase() as CookieSameSite;
      }
    }

    parsed.push({
      name: parts[0].slice(0, separator),
      value: parts[0].slice(separator + 1),
      options,
    });
  }

  return parsed;
}

export async function applyBackendSetCookies(response: Response) {
  const cookieStore = await cookies();

  for (const { name, value, options } of parseBackendCookies(response)) {
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
  for (const { name, value, options } of parseBackendCookies(from)) {
    to.cookies.set(name, value, options);
  }
}
