/**
 * Lectura de las cabeceras `Set-Cookie` que devuelve el backend.
 *
 * Vive aparte de `auth-cookies.ts` porque el middleware tambien necesita
 * interpretarlas para renovar la sesion, y alli no se puede importar
 * `next/headers`: el middleware corre antes de que exista una peticion con
 * contexto de React.
 */

export type CookieSameSite = "lax" | "strict" | "none";

export type ParsedCookie = {
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

function getSetCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  return headers.getSetCookie?.() ?? [];
}

/**
 * Traduce las cabeceras `Set-Cookie` del backend a la forma que espera Next.
 *
 * Dejamos que Next infiera "Secure" segun si la conexion es HTTPS, e ignoramos
 * el "Domain" del backend para que el navegador asocie la cookie al host
 * actual, que puede ser una IP.
 *
 * El valor se copia tal cual viene, todavia porcentaje-codificado: Next lo
 * vuelve a codificar al escribir la cookie y lo decodifica al leerla, asi que
 * el viaje de ida y vuelta devuelve exactamente este mismo texto. Decodificarlo
 * aqui romperia la firma de Express, que viaja como `s%3A<valor>.<firma>`.
 */
export function parseSetCookieHeaders(response: Response): ParsedCookie[] {
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
