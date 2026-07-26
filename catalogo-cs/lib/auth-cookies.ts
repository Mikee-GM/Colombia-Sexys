import { cookies } from "next/headers";

type CookieSameSite = "lax" | "strict" | "none";

function getSetCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  return headers.getSetCookie?.() ?? [];
}

export async function applyBackendSetCookies(response: Response) {
  const cookieStore = await cookies();

  for (const header of getSetCookieHeaders(response)) {
    const parts = header.split(";").map((part) => part.trim());
    const separator = parts[0].indexOf("=");
    if (separator < 1) continue;

    const name = parts[0].slice(0, separator);
    const value = parts[0].slice(separator + 1);
    const options: {
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: CookieSameSite;
      path?: string;
      domain?: string;
      maxAge?: number;
      expires?: Date;
    } = {};

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

    // Dejamos que Next.js infiera "Secure" según si es HTTPS o HTTP.
    // Ignoramos el "Domain" del backend para que el navegador lo asocie a la IP actual (ej. 169.x.x.x)
    cookieStore.set(name, value, options);
  }
}
