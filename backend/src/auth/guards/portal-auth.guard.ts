import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth.service';
import { ACCESS_COOKIE } from '../auth.constants';
import { CsrfGuard } from './csrf.guard';

/**
 * Autenticacion de los portales de empleada y chofer, que se abren desde una
 * Mini App de Telegram y por eso admiten un token de portal ademas de la sesion
 * normal.
 *
 * Reemplaza la cascada query token → Bearer → cookie que estaba copiada a mano
 * en EmployeePortalController y DriverPortalController. Deja el usuario
 * resuelto en `request.portalUserId` para que el controlador no repita la
 * verificacion.
 */
@Injectable()
export class PortalAuthGuard implements CanActivate {
  /**
   * Los portales tienen mutaciones que mueven dinero --registrar un extra,
   * cerrar un servicio-- y se autentican por cookie, asi que necesitan la misma
   * proteccion contra peticiones de otro sitio que el resto del panel. Aqui
   * faltaba: eran los unicos endpoints que la sostenian solo en `SameSite`, una
   * variable pensada precisamente para poder cambiarse a `none`.
   *
   * El guardia se salta solo cuando no hay cookie de sesion, que es como entra
   * un enlace antiguo con el token en la URL: sin cookie no hay nada que
   * falsificar desde fuera.
   */
  private readonly csrfGuard = new CsrfGuard();

  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    this.csrfGuard.canActivate(context);

    const request = context.switchToHttp().getRequest<
      Request & {
        portalUserId?: string;
        signedCookies?: Record<string, string>;
      }
    >();

    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException(
        'Token de acceso requerido para consultar el portal',
      );
    }

    const payload = await this.authService.verifyPortalToken(token);
    request.portalUserId = payload.sub;
    return true;
  }

  private extractToken(
    request: Request & { signedCookies?: Record<string, string> },
  ): string | null {
    const queryToken = request.query?.token;
    if (typeof queryToken === 'string' && queryToken) return queryToken;

    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);

    return (
      request.signedCookies?.[ACCESS_COOKIE] ??
      (request.cookies?.[ACCESS_COOKIE] as string | undefined) ??
      null
    );
  }
}
