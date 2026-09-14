import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { Usuarios } from '../../users/entities/user.entity';
import { AuthSession } from '../entities/auth-session.entity';
import { ACCESS_COOKIE } from '../auth.constants';

const cookieExtractor = (request: { signedCookies?: Record<string, string> }) =>
  request?.signedCookies?.[ACCESS_COOKIE] ?? null;

/**
 * Cuanto sigue valiendo un access token cuya sesion acaba de rotar. Es el mismo
 * margen que `AuthService.refresh` da a dos renovaciones que se cruzan.
 */
const GRACIA_DE_ROTACION_MS = 30_000;

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
      where: { id: payload.sid, userId: payload.sub },
      select: {
        id: true,
        expiresAt: true,
        revokedAt: true,
        replacedBySessionId: true,
      },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('La sesión ya no es válida');
    }
    if (session.revokedAt && !this.esRotacionReciente(session)) {
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

  /**
   * La sesion acaba de rotar, que no es lo mismo que haberse cerrado.
   *
   * Al renovar, la sesion vieja se marca revocada en el mismo instante en que
   * nace la nueva. Cualquier peticion que ya iba en camino con el access token
   * anterior --o la del segundo que tarda el navegador en guardar la cookie
   * nueva-- llegaba con un `sid` recien revocado y se respondia 401. El panel
   * lee ese 401 como sesion caida y manda al login: la persona se veia echada
   * justo en el momento en que su sesion se estaba renovando bien.
   *
   * La ventana solo cubre eso. Se exige `replacedBySessionId`, que unicamente
   * pone la rotacion: un cierre de sesion o una revocacion por seguridad dejan
   * ese campo vacio y siguen cortando en el acto, que es lo que tienen que
   * hacer.
   */
  private esRotacionReciente(session: AuthSession): boolean {
    if (!session.revokedAt || !session.replacedBySessionId) return false;
    return Date.now() - session.revokedAt.getTime() < GRACIA_DE_ROTACION_MS;
  }
}
