import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'crypto';
import { Usuarios } from '../users/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { AuthSession } from './entities/auth-session.entity';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from './auth.constants';

type TokenPayload = {
  sub: string;
  email: string;
  rol: Usuarios['rol'];
  sid: string;
  familyId: string;
  type: 'access' | 'refresh';
};

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  user: Pick<Usuarios, 'id' | 'email' | 'rol'>;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    @InjectRepository(AuthSession)
    private readonly sessionsRepository: Repository<AuthSession>,
    private readonly jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto, deviceId: string): Promise<AuthTokens> {
    const { email, password } = loginDto;

    if (!email || !password) {
      throw new UnauthorizedException('Debe ingresar email y contraseña');
    }

    // `passwordHash` es `select: false` en la entidad, asi que hay que pedirlo
    // explicitamente: este es el unico sitio del backend que lo necesita.
    const user = await this.usuariosRepository
      .createQueryBuilder('usuario')
      .addSelect('usuario.passwordHash')
      .where('usuario.email = :email', { email })
      .getOne();

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.activo) {
      throw new UnauthorizedException('Usuario inactivo');
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Update puntual en vez de save(): guardar la entidad entera reescribiria
    // el hash que acabamos de cargar y bloquearia la fila sin necesidad.
    await this.usuariosRepository.update(user.id, { lastLoginAt: new Date() });

    return this.createTokenPair(user, deviceId);
  }

  /**
   * Abre sesion para un usuario ya identificado por otra via.
   *
   * Lo usa el canje del pase de Telegram: la contrasena no interviene porque la
   * identidad ya quedo probada al vincular el chat. Todo lo demas -- par de
   * tokens, sesion registrada, expiraciones -- es identico a un login normal,
   * asi que la sesion resultante no es mas larga ni mas poderosa.
   */
  async issueSessionFor(user: Usuarios, deviceId: string): Promise<AuthTokens> {
    if (!user.activo) {
      throw new UnauthorizedException('Usuario inactivo');
    }
    await this.usuariosRepository.update(user.id, { lastLoginAt: new Date() });
    return this.createTokenPair(user, deviceId);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    const payload = await this.verifyRefreshToken(refreshToken);

    return this.sessionsRepository.manager.transaction(async (manager) => {
      const sessions = manager.getRepository(AuthSession);
      const current = await sessions.findOne({
        where: { id: payload.sid },
        lock: { mode: 'pessimistic_write' },
      });

      const isRecentlyReplaced =
        current &&
        current.revokedAt !== null &&
        current.replacedBySessionId !== null &&
        Date.now() - current.revokedAt.getTime() < 30000;

      const compromised =
        !current ||
        current.userId !== payload.sub ||
        current.familyId !== payload.familyId ||
        (current.revokedAt !== null && !isRecentlyReplaced) ||
        current.expiresAt.getTime() <= Date.now() ||
        current.refreshTokenHash !== this.hashToken(refreshToken);

      if (isRecentlyReplaced) {
        throw new UnauthorizedException('Sesión recién renovada');
      }

      if (compromised) {
        await sessions
          .createQueryBuilder()
          .update()
          .set({ revokedAt: new Date() })
          .where('user_id = :userId AND revoked_at IS NULL', {
            userId: payload.sub,
          })
          .execute();
        throw new UnauthorizedException('La sesión fue revocada por seguridad');
      }

      const user = await manager.getRepository(Usuarios).findOne({
        where: { id: payload.sub, activo: true },
      });
      if (!user) {
        await sessions.update(current.id, { revokedAt: new Date() });
        throw new UnauthorizedException('Usuario no válido o inactivo');
      }

      const next = await sessions.save(
        sessions.create({
          userId: user.id,
          familyId: current.familyId,
          deviceId: current.deviceId,
          refreshTokenHash: '0'.repeat(64),
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
          revokedAt: null,
          replacedBySessionId: null,
        }),
      );
      const tokens = await this.signTokens(user, next);
      next.refreshTokenHash = this.hashToken(tokens.refreshToken);
      current.revokedAt = new Date();
      current.replacedBySessionId = next.id;
      await sessions.save([current, next]);

      return {
        ...tokens,
        csrfToken: randomUUID(),
        user: this.publicUser(user),
      };
    });
  }

  async logout(accessToken?: string): Promise<void> {
    if (!accessToken) return;
    try {
      const payload = await this.jwtService.verifyAsync<TokenPayload>(
        accessToken,
        {
          secret: this.accessSecret(),
          clockTolerance: 60,
          ignoreExpiration: true,
        },
      );
      await this.sessionsRepository.update(
        { id: payload.sid, userId: payload.sub },
        { revokedAt: new Date() },
      );
    } catch {
      // El cierre de sesión siempre limpia cookies, incluso con access expirado.
    }
  }

  private async createTokenPair(
    user: Usuarios,
    deviceId: string,
  ): Promise<AuthTokens> {
    const familyId = randomUUID();
    const session = await this.sessionsRepository.save(
      this.sessionsRepository.create({
        userId: user.id,
        familyId,
        deviceId,
        refreshTokenHash: '0'.repeat(64),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
        revokedAt: null,
        replacedBySessionId: null,
      }),
    );
    const tokens = await this.signTokens(user, session);
    session.refreshTokenHash = this.hashToken(tokens.refreshToken);
    await this.sessionsRepository.save(session);

    return {
      ...tokens,
      csrfToken: randomUUID(),
      user: this.publicUser(user),
    };
  }

  private async signTokens(user: Usuarios, session: AuthSession) {
    const basePayload = {
      sub: user.id,
      email: user.email,
      rol: user.rol,
      sid: session.id,
      familyId: session.familyId,
    };
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { ...basePayload, type: 'access' satisfies TokenPayload['type'] },
        {
          secret: this.accessSecret(),
          expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        },
      ),
      this.jwtService.signAsync(
        { ...basePayload, type: 'refresh' satisfies TokenPayload['type'] },
        {
          secret: this.refreshSecret(),
          expiresIn: REFRESH_TOKEN_TTL_SECONDS,
        },
      ),
    ]);
    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(token: string): Promise<TokenPayload> {
    try {
      const payload = await this.jwtService.verifyAsync<TokenPayload>(token, {
        secret: this.refreshSecret(),
        clockTolerance: 60,
      });
      if (payload.type !== 'refresh') throw new Error('Tipo inválido');
      return payload;
    } catch {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }
  }

  /**
   * Borra sesiones que ya no puede usar nadie.
   *
   * Cada refresco rota la sesion: crea una fila nueva y revoca la anterior. Con
   * un access token de 15 minutos, un usuario activo deja decenas de filas al
   * dia y la tabla no para de crecer.
   *
   * Solo se borra lo que no cambia el comportamiento de `refresh`. Una fila
   * ausente se trata como sesion comprometida y revoca todas las del usuario,
   * exactamente igual que una caducada o una ya revocada, asi que quitar esas
   * filas no relaja nada. Lo que si importa es no tocar las recientes: la
   * ventana de 30 segundos que tolera dos refrescos simultaneos necesita
   * encontrar la fila, y sin ella una renovacion legitima cerraria la sesion
   * del usuario. De ahi el margen de 30 dias, muy por encima de esa ventana.
   *
   * El borrado va por lotes: la primera pasada sobre una base vieja puede
   * encontrar muchisimas filas y no conviene sostener ese bloqueo de golpe.
   */
  async purgeStaleSessions(
    batchSize = 5_000,
    maxBatches = 20,
  ): Promise<number> {
    let total = 0;

    for (let i = 0; i < maxBatches; i += 1) {
      const result: [unknown[], number] = await this.sessionsRepository.query(
        `DELETE FROM auth_sessions
          WHERE id IN (
            SELECT id FROM auth_sessions
             WHERE expires_at < now() - interval '30 days'
                OR (revoked_at IS NOT NULL
                    AND revoked_at < now() - interval '30 days')
             LIMIT $1
          )`,
        [batchSize],
      );

      const borradas = Array.isArray(result) ? (result[1] ?? 0) : 0;
      total += borradas;
      if (borradas < batchSize) break;
    }

    if (total > 0) {
      this.logger.log(`Sesiones caducadas eliminadas: ${total}`);
    }
    return total;
  }

  async generatePortalToken(user: Usuarios): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        rol: user.rol,
        type: 'employee_portal',
      },
      {
        secret: this.accessSecret(),
        expiresIn: 86400 * 7, // 7 días para conveniencia de la empleada en Telegram
      },
    );
  }

  async verifyPortalToken(
    token: string,
  ): Promise<{ sub: string; email: string; rol: string }> {
    try {
      const payload = await this.jwtService.verifyAsync<any>(token, {
        secret: this.accessSecret(),
      });
      if (
        !payload ||
        (payload.type !== 'employee_portal' && payload.type !== 'access')
      ) {
        throw new Error('Tipo de token inválido');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Token de portal inválido o expirado');
    }
  }

  private accessSecret(): string {
    return process.env.JWT_SECRET as string;
  }

  private refreshSecret(): string {
    return process.env.JWT_REFRESH_SECRET as string;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private publicUser(user: Usuarios) {
    return { id: user.id, email: user.email, rol: user.rol };
  }
}
