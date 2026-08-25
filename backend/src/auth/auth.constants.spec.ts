import {
  REFRESH_COOKIE_PATH,
  cookieOptions,
  clearCookieOptions,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.constants';

/**
 * El navegador solo manda una cookie cuando la ruta que pide cuelga de su
 * `Path`. La cookie de refresh estuvo acotada a `/auth/refresh`, que no es
 * ninguna de las dos rutas por las que se pide de verdad, asi que no salia
 * nunca: el refresh fallaba siempre y la sesion moria al caducar el access
 * token. No lo detecto nada porque el `Path` no se comparaba con ninguna URL
 * real. Aqui si se comparan.
 */
describe('alcance de la cookie de refresh', () => {
  /** Regla del navegador (RFC 6265): coincide el path exacto o lo que cuelga. */
  function elNavegadorLaEnvia(cookiePath: string, url: string): boolean {
    if (!url.startsWith(cookiePath)) return false;
    return (
      cookiePath.endsWith('/') ||
      url.length === cookiePath.length ||
      url[cookiePath.length] === '/'
    );
  }

  it('la envia al endpoint real del backend, con prefijo y version', () => {
    expect(
      elNavegadorLaEnvia(REFRESH_COOKIE_PATH, '/api/v1/auth/refresh'),
    ).toBe(true);
  });

  it('la envia al proxy por el que la pide el navegador', () => {
    // El front expone el backend bajo `/api`, sin la version.
    expect(elNavegadorLaEnvia(REFRESH_COOKIE_PATH, '/api/auth/refresh')).toBe(
      true,
    );
  });

  it('la envia al pintar una pagina, que es cuando se renueva la sesion', () => {
    // Recargar es un render de servidor: si la cookie no viaja con la peticion
    // de la pagina, el middleware no tiene con que renovar.
    for (const pagina of ['/admin/dashboard', '/jefe', '/jefe/reportes']) {
      expect(elNavegadorLaEnvia(REFRESH_COOKIE_PATH, pagina)).toBe(true);
    }
  });

  it('se borra con el mismo alcance con el que se puso', () => {
    // Un `Path` distinto al del alta deja la cookie viva tras cerrar sesion.
    expect(clearCookieOptions(REFRESH_COOKIE_PATH).path).toBe(
      cookieOptions(REFRESH_TOKEN_TTL_SECONDS, REFRESH_COOKIE_PATH).path,
    );
  });

  it('sigue siendo httpOnly: ampliar el alcance no la expone a scripts', () => {
    const options = cookieOptions(
      REFRESH_TOKEN_TTL_SECONDS,
      REFRESH_COOKIE_PATH,
    );
    expect(options.httpOnly).toBe(true);
    expect(options.signed).toBe(true);
  });
});
