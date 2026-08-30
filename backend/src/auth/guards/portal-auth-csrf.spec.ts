import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { PortalAuthGuard } from './portal-auth.guard';
import { ACCESS_COOKIE, CSRF_COOKIE } from '../auth.constants';

/**
 * Los portales de empleada y chofer eran los unicos endpoints que mutaban
 * estado sin `CsrfGuard`: agregar un extra, cerrar un servicio y subir fotos
 * iban con `PortalAuthGuard` a secas. Los salvaba `sameSite: 'lax'`, que es una
 * variable de entorno pensada para poder ponerse en `none` el dia que el panel
 * se sirva desde otro dominio; el dia que eso pase, cualquier pagina podria
 * cerrar un servicio ajeno desde el navegador de la empleada.
 */
describe('PortalAuthGuard: CSRF en las mutaciones del portal', () => {
  const authService = {
    verifyPortalToken: jest.fn().mockResolvedValue({ sub: 'user-1' }),
  };
  const guard = new PortalAuthGuard(authService as never);

  const contexto = (request: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  const peticion = (extra: Record<string, unknown> = {}) => ({
    method: 'POST',
    headers: {},
    query: {},
    cookies: {},
    signedCookies: { [ACCESS_COOKIE]: 'token-de-sesion' },
    ...extra,
  });

  beforeEach(() => jest.clearAllMocks());

  it('rechaza una mutación por cookie sin la cabecera', async () => {
    await expect(
      guard.canActivate(contexto(peticion())),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(authService.verifyPortalToken).not.toHaveBeenCalled();
  });

  it('rechaza una cabecera que no coincide con la cookie', async () => {
    await expect(
      guard.canActivate(
        contexto(
          peticion({
            cookies: { [CSRF_COOKIE]: 'aaaaaaaa' },
            headers: { 'x-csrf-token': 'bbbbbbbb' },
          }),
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('deja pasar la mutación cuando cookie y cabecera coinciden', async () => {
    await expect(
      guard.canActivate(
        contexto(
          peticion({
            cookies: { [CSRF_COOKIE]: 'token-csrf' },
            headers: { 'x-csrf-token': 'token-csrf' },
          }),
        ),
      ),
    ).resolves.toBe(true);
  });

  /** Asi entra la Mini App desde el enlace del bot: sin cookie no hay CSRF. */
  it('no pide CSRF cuando se entra con el token en la URL', async () => {
    await expect(
      guard.canActivate(
        contexto(
          peticion({ signedCookies: {}, query: { token: 'token-del-bot' } }),
        ),
      ),
    ).resolves.toBe(true);
    expect(authService.verifyPortalToken).toHaveBeenCalledWith('token-del-bot');
  });

  it('no pide CSRF cuando el token viaja en la cabecera Authorization', async () => {
    await expect(
      guard.canActivate(
        contexto(
          peticion({ headers: { authorization: 'Bearer token-del-bot' } }),
        ),
      ),
    ).resolves.toBe(true);
  });

  it('no estorba a las lecturas del portal', async () => {
    await expect(
      guard.canActivate(contexto(peticion({ method: 'GET' }))),
    ).resolves.toBe(true);
  });
});
