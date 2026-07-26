import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Usuarios } from '../../users/entities/user.entity';

export const GetUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: Usuarios }>();
    const user = request.user;

    return data ? user?.[data as keyof Usuarios] : user;
  },
);
