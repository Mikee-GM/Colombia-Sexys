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

/**
 * Cabecera `Cookie` para hablar con el backend desde el middleware o un route
 * handler.
 *
 * NO vale reenviar `request.headers.get("cookie")` tal cual. Las cookies que
 * escribe Next quedan doblemente codificadas en el navegador: `parseSetCookieHeaders`
 * copia el valor tal y como lo emitio Express --ya codificado, `s%3A...`-- y
 * Next lo vuelve a codificar al guardarlo, asi que el navegador almacena
 * `s%253A...`.
 *
 * Al leerlas con `request.cookies` se deshace una capa y queda el valor tal
 * como lo emitio Express; Express deshace la otra al recibirlas y reconoce su
 * firma. Reenviando la cabecera cruda llega una capa de mas: Express obtiene
 * `s%3A...`, que no empieza por `s:`, no lo trata como cookie firmada y
 * `signedCookies` queda vacio. El sintoma era que la renovacion de sesion
 * respondia 401 siempre y la sesion moria a los quince minutos, mientras que
 * `/auth/me` --que ya armaba la cabecera asi-- funcionaba sin problema.
 */
export function buildCookieHeader(request: {
  cookies: { getAll: () => { name: string; value: string }[] };
}): string {
  return request.cookies
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
}
