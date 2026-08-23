import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Usuarios } from '../../users/entities/user.entity';
import { AuthSession } from '../entities/auth-session.entity';
import { JwtStrategy } from './jwt.strategy';

/**
 * `validate()` es lo que separa un token valido de uno revocado. Antes de C-3 el
 * access token duraba un año y no miraba la sesion, asi que cerrar sesion no
 * invalidaba nada: estas pruebas fijan que ahora si lo hace.
 */
describe('JwtStrategy.validate', () => {
  const activeUser = { id: 'user-1', activo: true } as Usuarios;

  function build(overrides: {
    session?: Partial<AuthSession> | null;
    user?: Usuarios | null;
  }) {
    // Se guarda el mock aparte en vez de leerlo del repositorio: sacar un
    // metodo de su objeto para aserciones dispara la regla `unbound-method`.
    const findOne = jest
      .fn()
      .mockResolvedValue(
        overrides.session === undefined
          ? { id: 'sid-1', expiresAt: new Date(Date.now() + 60_000) }
          : overrides.session,
      );
    const sessions = { findOne } as unknown as Repository<AuthSession>;
    const users = {
      findOne: jest
        .fn()
        .mockResolvedValue(
          overrides.user === undefined ? activeUser : overrides.user,
        ),
    } as unknown as Repository<Usuarios>;
    const config = {
      getOrThrow: jest.fn().mockReturnValue('x'.repeat(32)),
    } as unknown as ConfigService;

    return { strategy: new JwtStrategy(users, sessions, config), findOne };
  }

  const payload = { sub: 'user-1', email: 'a@b.c', sid: 'sid-1' };

  it('acepta un token cuya sesión sigue viva', async () => {
    const { strategy } = build({});
    await expect(strategy.validate(payload)).resolves.toBe(activeUser);
  });

  it('rechaza un token sin sesión asociada', async () => {
    const { strategy } = build({});
    await expect(
      strategy.validate({ sub: 'user-1', email: 'a@b.c' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza un token cuya sesión fue revocada', async () => {
    // El repositorio filtra por `revokedAt: IsNull()`, asi que una sesion
    // revocada simplemente no aparece.
    const { strategy } = build({ session: null });
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza un token cuya sesión ya caducó', async () => {
    const { strategy } = build({
      session: { id: 'sid-1', expiresAt: new Date(Date.now() - 1) },
    });
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza un refresh token usado como access token', async () => {
    const { strategy } = build({});
    await expect(
      strategy.validate({ ...payload, type: 'refresh' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza a un usuario desactivado aunque la sesión siga viva', async () => {
    const { strategy } = build({ user: null });
    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('exige que la sesión pertenezca al usuario del token', async () => {
    const { strategy, findOne } = build({});
    await strategy.validate(payload);
    expect(findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'sid-1', userId: 'user-1' }),
      }),
    );
  });
});
