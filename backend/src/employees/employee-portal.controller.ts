import {
  Controller,
  Get,
  Req,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { EmployeesService } from './employees.service';
import { AuthService } from '../auth/auth.service';
import { ACCESS_COOKIE } from '../auth/auth.constants';
import { ApiControllerDocs } from '../common/swagger/api-docs.decorators';

@Controller('employee-portal')
@ApiControllerDocs('employee-portal')
export class EmployeePortalController {
  constructor(
    private readonly employeesService: EmployeesService,
    private readonly authService: AuthService,
  ) {}

  @Get('me')
  async getMyPortal(
    @Req() request: Request,
    @Query('token') queryToken?: string,
  ) {
    let userId: string | null = null;

    // 1. Check query token from Telegram Mini App link
    if (queryToken) {
      const payload = await this.authService.verifyPortalToken(queryToken);
      userId = payload.sub;
    } else {
      // 2. Check authorization header
      const authHeader = request.headers['authorization'];
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const bearerToken = authHeader.substring(7);
        const payload = await this.authService.verifyPortalToken(bearerToken);
        userId = payload.sub;
      } else {
        // 3. Check cookie
        const cookieToken =
          (request as any).signedCookies?.[ACCESS_COOKIE] ||
          (request as any).cookies?.[ACCESS_COOKIE];
        if (cookieToken) {
          const payload = await this.authService.verifyPortalToken(cookieToken);
          userId = payload.sub;
        }
      }
    }

    if (!userId) {
      throw new UnauthorizedException(
        'Token de acceso requerido para consultar el portal',
      );
    }

    return this.employeesService.getEmployeePortalData(userId);
  }
}
