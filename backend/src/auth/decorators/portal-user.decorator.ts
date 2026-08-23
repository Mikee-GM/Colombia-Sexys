import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

/** Id de usuario que dejo resuelto PortalAuthGuard. */
export const PortalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ portalUserId?: string }>();
    if (!request.portalUserId) {
      throw new UnauthorizedException('Portal sin usuario autenticado');
    }
    return request.portalUserId;
  },
);
