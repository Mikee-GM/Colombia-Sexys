import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { IsNull, Repository } from 'typeorm';
import { Usuarios } from '../../users/entities/user.entity';
import { AuthSession } from '../entities/auth-session.entity';
import { ACCESS_COOKIE } from '../auth.constants';

const cookieExtractor = (request: { signedCookies?: Record<string, string> }) =>
  request?.signedCookies?.[ACCESS_COOKIE] ?? null;

type AccessPayload = {
  sub: string;
  email: string;
  sid?: string;
  type?: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    @InjectRepository(AuthSession)
    private readonly sessionsRepository: Repository<AuthSession>,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        cookieExtractor,
      ]),
      ignoreExpiration: false,
      // Sin fallback: si falta el secreto el proceso no arranca, que es
      // preferible a arrancar firmando con una clave publicada en el repo.
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: AccessPayload) {
    if (payload.type && payload.type !== 'access') {
      throw new UnauthorizedException('Tipo de token inválido');
    }

    // El token va atado a una sesion concreta: sin esta comprobacion, cerrar
    // sesion o revocar una familia de refresh no invalidaria el access token
    // que ya esta circulando.
    if (!payload.sid) {
      throw new UnauthorizedException('Token sin sesión asociada');
    }
    const session = await this.sessionsRepository.findOne({
      where: { id: payload.sid, userId: payload.sub, revokedAt: IsNull() },
      select: { id: true, expiresAt: true },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('La sesión ya no es válida');
    }

    const user = await this.usuariosRepository.findOne({
      where: { id: payload.sub, activo: true },
    });
    if (!user) {
      throw new UnauthorizedException('Usuario no válido o inactivo');
    }
    return user;
  }
}
