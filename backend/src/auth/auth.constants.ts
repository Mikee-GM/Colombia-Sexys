import type { CookieOptions } from 'express';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
export const CSRF_COOKIE = 'csrf_token';
/**
 * El access token es corto a proposito: no se puede revocar por si mismo, asi
 * que su ventana de riesgo tiene que ser pequeña. La sesion larga la sostiene
 * el refresh token, que si vive en base de datos y se puede invalidar.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutos
export const REFRESH_TOKEN_TTL_SECONDS = 365 * 24 * 60 * 60; // 1 año de sesión por defecto

/**
 * La cookie de refresh solo se envia a la ruta que la consume. Mandarla en
 * cada peticion la expone sin ninguna ventaja.
 */
export const REFRESH_COOKIE_PATH = '/auth/refresh';

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
