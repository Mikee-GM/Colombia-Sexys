import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CsrfGuard } from './guards/csrf.guard';
import {
  ACCESS_COOKIE,
  ACCESS_TOKEN_TTL_SECONDS,
  clearCookieOptions,
  cookieOptions,
  CSRF_COOKIE,
  csrfCookieOptions,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.constants';
import {
  ApiControllerDocs,
  ApiLoginDocs,
} from '../common/swagger/api-docs.decorators';

@Controller('auth')
@ApiControllerDocs('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiLoginDocs(LoginDto)
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const deviceId =
      request.headers['x-device-id']?.toString().slice(0, 128) ||
      request.headers['user-agent']?.slice(0, 128) ||
      'unknown';
    const result = await this.authService.login(loginDto, deviceId);
    this.setAuthCookies(response, result);
    return { user: result.user };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.signedCookies?.[REFRESH_COOKIE] as
      | string
      | undefined;
    if (!refreshToken) {
      throw new UnauthorizedException('No existe una sesión renovable');
    }
    const csrfCookie = request.cookies?.[CSRF_COOKIE] as string | undefined;
    const csrfHeader = request.headers['x-csrf-token'];
    if (!csrfCookie || csrfHeader !== csrfCookie) {
      throw new UnauthorizedException('Token CSRF inválido');
    }

    const result = await this.authService.refresh(refreshToken);
    this.setAuthCookies(response, result);
    return { user: result.user };
  }

  @Post('logout')
  @UseGuards(CsrfGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(
      request.signedCookies?.[ACCESS_COOKIE] as string | undefined,
    );
    this.clearAuthCookies(response);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() request: Request) {
    const user = request.user as {
      id: string;
      email: string;
      rol: string;
    };
    return { id: user.id, email: user.email, rol: user.rol };
  }

  private setAuthCookies(
    response: Response,
    result: {
      accessToken: string;
      refreshToken: string;
      csrfToken: string;
    },
  ) {
    response.cookie(
      ACCESS_COOKIE,
      result.accessToken,
      cookieOptions(ACCESS_TOKEN_TTL_SECONDS),
    );
    response.cookie(
      REFRESH_COOKIE,
      result.refreshToken,
      cookieOptions(REFRESH_TOKEN_TTL_SECONDS, REFRESH_COOKIE_PATH),
    );
    response.cookie(CSRF_COOKIE, result.csrfToken, csrfCookieOptions());
  }

  private clearAuthCookies(response: Response) {
    response.clearCookie(ACCESS_COOKIE, clearCookieOptions());
    response.clearCookie(
      REFRESH_COOKIE,
      clearCookieOptions(REFRESH_COOKIE_PATH),
    );
    const csrfOptions = csrfCookieOptions();
    delete csrfOptions.maxAge;
    response.clearCookie(CSRF_COOKIE, csrfOptions);
  }
}
