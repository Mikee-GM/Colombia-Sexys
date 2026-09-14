import type { CookieOptions } from 'express';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
export const CSRF_COOKIE = 'csrf_token';
/**
 * Doce horas, y la razon de que se pueda es que el token no vale por si solo.
 *
 * La idea de tenerlo corto venia de que un access token no se puede revocar:
 * cerrar sesion invalida el refresh, no este. Eso dejo de ser cierto cuando
 * `JwtStrategy` paso a comprobar la fila de la sesion EN CADA PETICION: el
 * token va atado a un `sid`, y si esa sesion esta revocada o caducada se
 * rechaza en el acto, dure lo que dure el token. Un cierre de sesion o una
 * revocacion por seguridad siguen surtiendo efecto al instante.
 *
 * Lo que si pesa es lo otro: cada renovacion es una rotacion, y cada rotacion
 * es una oportunidad de que algo salga mal --una peticion en camino con el
 * token anterior, una carrera entre dos pestañas, un bache de red justo en ese
 * segundo--. Pasar de una hora a doce deja una rotacion al dia en vez de doce,
 * y estos paneles viven instalados en el telefono y tienen que seguir
 * despiertos para recibir avisos.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 12 * 60 * 60; // 12 horas
export const REFRESH_TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60; // 1 año de sesión por defecto

/**
 * Alcance de la cookie de refresh.
 *
 * Estuvo acotada a `/auth/refresh` para no mandarla en cada peticion, pero esa
 * ruta no existe en ningun lado: el backend publica el endpoint bajo el prefijo
 * global y la version (`/api/v1/auth/refresh`) y el navegador lo pide a traves
 * del proxy del front (`/api/auth/refresh`). Como el navegador solo manda una
 * cookie cuando la ruta pedida cuelga de su `Path`, no coincidia con ninguna de
 * las dos y la cookie no salia nunca: el refresh fallaba siempre y la sesion
 * moria al caducar el access token, sin forma de renovarse.
 *
 * Ademas la renovacion tiene que ocurrir al pintar la pagina -- recargar es un
 * render de servidor --, y ahi la cookie solo esta disponible si su `Path`
 * cubre la ruta de la pagina. Con cualquier alcance mas estrecho que la raiz la
 * renovacion en servidor es imposible, asi que el ahorro de no enviarla cuesta
 * la sesion entera. Sigue siendo httpOnly, firmada y `Secure` en produccion.
 */
export const REFRESH_COOKIE_PATH = '/';

export function cookieOptions(
  maxAgeSeconds: number,
  path = '/',
): CookieOptions {
  const sameSite =
    process.env.AUTH_COOKIE_SAME_SITE === 'none' ? 'none' : 'lax';

  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || sameSite === 'none',
    sameSite,
    signed: true,
    path,
    maxAge: maxAgeSeconds * 1000,
    ...(process.env.AUTH_COOKIE_DOMAIN
      ? { domain: process.env.AUTH_COOKIE_DOMAIN }
      : {}),
  };
}

export function csrfCookieOptions(): CookieOptions {
  const options = cookieOptions(REFRESH_TOKEN_TTL_SECONDS);
  options.httpOnly = false;
  options.signed = false;
  return options;
}

export function clearCookieOptions(path = '/'): CookieOptions {
  const options = cookieOptions(1, path);
  delete options.maxAge;
  return options;
}
