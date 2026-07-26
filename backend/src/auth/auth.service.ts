import { Injectable, UnauthorizedException } from '@nestjs/common';
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

    const user = await this.usuariosRepository.findOne({
      where: { email },
    });

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

    // Update last login timestamp
    user.lastLoginAt = new Date();
    await this.usuariosRepository.save(user);

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

      const compromised =
        !current ||
        current.userId !== payload.sub ||
        current.familyId !== payload.familyId ||
        current.revokedAt !== null ||
        current.expiresAt.getTime() <= Date.now() ||
        current.refreshTokenHash !== this.hashToken(refreshToken);

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
