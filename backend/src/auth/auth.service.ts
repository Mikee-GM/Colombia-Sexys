import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
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
  /**
   * Nulo cuando la renovacion no rota nada y hay que dejar la cookie de
   * refresco como esta: es el caso de dos pestanas renovando a la vez.
   */
  refreshToken: string | null;
  csrfToken: string;
  user: Pick<Usuarios, 'id' | 'email' | 'rol'>;
};

/**
 * Hash de bcrypt que no es de nadie, usado para que un correo inexistente
 * cueste lo mismo que uno real. Es el hash de una cadena aleatoria: ninguna
 * contrasena escrita por una persona coincide con el.
 */
const HASH_DE_RELLENO =
  '$2b$10$DLAgOieOwvnrKXM3HkOkB.CF/viLWzLyuEW5Mc1TRwTSOj6TdrQ6O';

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

    // Se compara siempre, exista el correo o no. Sin esto, un correo
    // desconocido respondia al instante y uno real tardaba lo que tarda bcrypt:
    // la diferencia es medible desde fuera y basta para averiguar quien tiene
    // cuenta. El hash de relleno no corresponde a ninguna contrasena.
    const isMatch = await bcrypt.compare(
      password,
      user?.passwordHash ?? HASH_DE_RELLENO,
    );

    if (!user || !isMatch) {
      // Queda el rastro para poder mirar despues quien esta probando, pero sin
      // decir por que fallo: al que pregunta se le responde siempre lo mismo.
      this.logger.warn(
        `Intento de acceso fallido para ${email} desde ${deviceId}`,
      );
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // Despues de comprobar la contrasena, no antes: dicho antes, cualquiera
    // podia distinguir un correo dado de baja de uno que no existe.
    if (!user.activo) {
      this.logger.warn(`Acceso de una cuenta desactivada: ${email}`);
      throw new UnauthorizedException('Usuario inactivo');
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

  async refresh(
    refreshToken: string,
    csrfActual?: string,
  ): Promise<AuthTokens> {
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

      // Dos peticiones que renuevan a la vez --dos pestanas, o la pagina y su
      // fetch-- mandan el mismo refresco: la primera lo rota y la segunda llega
      // con uno ya gastado. Devolverle 401 a la segunda echaba del panel a
      // alguien con la sesion perfectamente viva, que es justo lo que se
      // reportaba al recargar tras un rato. En la ventana de gracia se le firma
      // un acceso nuevo sobre la sesion que gano y no se toca nada mas: sin
      // rotar, dos respuestas fuera de orden no pueden pisarse.
      if (isRecentlyReplaced) {
        return this.renovacionEnCarrera(manager, current, payload.sub);
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
        // El CSRF no se rota aqui a proposito. Rotarlo abria una carrera
        // propia: una peticion que ya habia leido la cookie vieja mandaba una
        // cabecera que dejaba de coincidir, y el rechazo se veia como sesion
        // caida. El token sigue cambiando en cada login y muriendo con el
        // cierre de sesion, que es cuando importa.
        csrfToken: csrfActual ?? randomUUID(),
        user: this.publicUser(user),
      };
    });
  }

  /**
   * La renovacion perdedora de una carrera: la sesion que este refresco tenia
   * ya fue sustituida hace segundos por otra peticion del mismo navegador.
   *
   * Se firma un acceso sobre la sesion nueva --la que esta viva, y a la que
   * apunta `replacedBySessionId`-- y se devuelve `refreshToken: null` para que
   * el controlador no reescriba la cookie de refresco. Si la respuesta ganadora
   * llega despues, su cookie es la buena; si llego antes, esta no la estropea.
   */
  private async renovacionEnCarrera(
    manager: EntityManager,
    anterior: AuthSession,
    userId: string,
  ): Promise<AuthTokens> {
    const sessions = manager.getRepository(AuthSession);
    const vigente = await sessions.findOne({
      where: { id: anterior.replacedBySessionId as string },
    });
    const user = await manager
      .getRepository(Usuarios)
      .findOne({ where: { id: userId, activo: true } });

    if (
      !vigente ||
      !user ||
      vigente.userId !== userId ||
      vigente.revokedAt !== null ||
      vigente.expiresAt.getTime() <= Date.now()
    ) {
      throw new UnauthorizedException('La sesión ya no está activa');
    }

    const { accessToken } = await this.signTokens(user, vigente);
    return {
      accessToken,
      refreshToken: null,
      csrfToken: '',
      user: this.publicUser(user),
    };
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

  /**
   * Valida el token con el que se entra a los portales de empleada y chofer.
   *
   * Comprueba lo mismo que la estrategia de una peticion normal: que la sesion
   * siga viva y que la cuenta siga activa. Antes solo miraba la firma, y eso
   * dejaba dos agujeros: cerrar sesion no expulsaba a nadie del portal --el
   * token seguia sirviendo hasta caducar-- y desactivar una cuenta tampoco.
   *
   * Y solo se admite ya el tipo `access`. Hubo un tipo `employee_portal` que
   * duraba siete dias y no llevaba sesion asociada, de modo que era imposible
   * de revocar; dejo de emitirse hace tiempo, pero se seguia aceptando, asi que
   * cualquiera emitido entonces continuaba siendo una llave valida.
   */
  async verifyPortalToken(
    token: string,
  ): Promise<{ sub: string; email: string; rol: string }> {
    const invalido = new UnauthorizedException(
      'Token de portal inválido o expirado',
    );

    let payload: TokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<TokenPayload>(token, {
        secret: this.accessSecret(),
      });
    } catch {
      throw invalido;
    }

    if (!payload || payload.type !== 'access' || !payload.sid) {
      throw invalido;
    }

    const session = await this.sessionsRepository.findOne({
      where: { id: payload.sid, userId: payload.sub, revokedAt: IsNull() },
      select: { id: true, expiresAt: true },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      throw invalido;
    }

    const user = await this.usuariosRepository.findOne({
      where: { id: payload.sub, activo: true },
      select: { id: true, email: true, rol: true },
    });
    if (!user) throw invalido;

    return { sub: user.id, email: user.email, rol: user.rol };
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
