import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Usuarios } from '../users/entities/user.entity';
import { AuthService } from './auth.service';
import { AuthSession } from './entities/auth-session.entity';

const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

/**
 * La rotacion de refresh tokens es la pieza que sostiene la sesion larga ahora
 * que el access token dura 15 minutos (C-3). Su valor esta en lo que hace
 * cuando algo va mal: un token robado y reutilizado tiene que tumbar todas las
 * sesiones del usuario, no solo la suya.
 */
describe('AuthService.refresh', () => {
  const user = {
    id: 'user-1',
    email: 'a@b.c',
    rol: 'jefe',
    activo: true,
  } as Usuarios;

  function build(session: Partial<AuthSession>) {
    const store = new Map<string, AuthSession>();
    const full = {
      id: 'sid-1',
      userId: user.id,
      familyId: 'fam-1',
      deviceId: 'dev-1',
      refreshTokenHash: hash('token-valido'),
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null,
      replacedBySessionId: null,
      ...session,
    } as AuthSession;
    store.set(full.id, full);

    const revokeAll = jest.fn().mockResolvedValue(undefined);
    const sessions = {
      findOne: jest.fn(({ where }) =>
        Promise.resolve(store.get(where.id) ?? null),
      ),
      create: jest.fn((data: Partial<AuthSession>) => ({
        id: randomUUID(),
        ...data,
      })),
      save: jest.fn((value: AuthSession | AuthSession[]) => {
        for (const s of Array.isArray(value) ? value : [value])
          store.set(s.id, s);
        return Promise.resolve(value);
      }),
      update: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        update: () => ({
          set: () => ({ where: () => ({ execute: revokeAll }) }),
        }),
      })),
    } as unknown as Repository<AuthSession>;

    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === AuthSession
          ? sessions
          : { findOne: () => Promise.resolve(user) },
      ),
    };
    const rootSessions = {
      manager: {
        transaction: (fn: (m: typeof manager) => unknown) => fn(manager),
      },
    } as unknown as Repository<AuthSession>;

    const jwt = {
      signAsync: jest.fn(() => Promise.resolve(`firmado-${randomUUID()}`)),
      verifyAsync: jest.fn(() =>
        Promise.resolve({
          sub: user.id,
          email: user.email,
          rol: user.rol,
          sid: full.id,
          familyId: full.familyId,
          type: 'refresh',
        }),
      ),
    } as unknown as JwtService;

    const service = new AuthService(
      {} as Repository<Usuarios>,
      rootSessions,
      jwt,
    );
    return { service, store, revokeAll, full };
  }

  it('rota la sesión y marca la anterior como reemplazada', async () => {
    const { service, store, full } = build({});

    const tokens = await service.refresh('token-valido');

    expect(tokens.accessToken).toBeDefined();
    expect(store.get(full.id)?.revokedAt).toBeInstanceOf(Date);
    expect(store.get(full.id)?.replacedBySessionId).toBeDefined();
  });

  it('revoca todas las sesiones si se reutiliza un refresh token viejo', async () => {
    // Revocada hace mucho: fuera de la ventana de gracia, es reuso.
    const { service, revokeAll } = build({
      revokedAt: new Date(Date.now() - 120_000),
      replacedBySessionId: 'sid-2',
    });

    await expect(service.refresh('token-valido')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(revokeAll).toHaveBeenCalled();
  });

  it('revoca todo si el hash del token no coincide con el guardado', async () => {
    const { service, revokeAll } = build({ refreshTokenHash: hash('otro') });

    await expect(service.refresh('token-valido')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(revokeAll).toHaveBeenCalled();
  });

  it('revoca todo si la sesión ya caducó', async () => {
    const { service, revokeAll } = build({
      expiresAt: new Date(Date.now() - 1),
    });

    await expect(service.refresh('token-valido')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(revokeAll).toHaveBeenCalled();
  });

  it('no castiga a dos peticiones concurrentes dentro de la ventana de gracia', async () => {
    // Recien rotada: es la segunda peticion en vuelo del mismo cliente, no un
    // atacante. Se rechaza la peticion pero no se tumba la familia entera.
    const { service, revokeAll } = build({
      revokedAt: new Date(Date.now() - 1_000),
      replacedBySessionId: 'sid-2',
    });

    await expect(service.refresh('token-valido')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(revokeAll).not.toHaveBeenCalled();
  });
});
