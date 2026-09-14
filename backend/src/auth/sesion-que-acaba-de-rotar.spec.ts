import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './strategies/jwt.strategy';

/**
 * Renovar no puede sentirse como que te echaron.
 *
 * Al renovar, la sesion vieja se marca revocada en el mismo instante en que
 * nace la nueva. Cualquier peticion que ya iba en camino con el access token
 * anterior llegaba con un `sid` recien revocado y se respondia 401; el panel
 * lee ese 401 como sesion caida y manda al login. La persona se veia echada
 * justo cuando su sesion se estaba renovando bien.
 *
 * Lo que se protege aqui es que la ventana cubra SOLO la rotacion: un cierre de
 * sesion o una revocacion por seguridad tienen que seguir cortando en el acto.
 */
describe('JwtStrategy: la sesion que acaba de rotar', () => {
  const usuario = { id: 'user-1', activo: true };

  function armar(session: Record<string, unknown> | null) {
    const sessionsRepository = {
      findOne: jest.fn().mockResolvedValue(session),
    };
    const usuariosRepository = {
      findOne: jest.fn().mockResolvedValue(usuario),
    };

    const strategy = Object.create(JwtStrategy.prototype) as JwtStrategy;
    Object.assign(strategy, { sessionsRepository, usuariosRepository });

    return { strategy, sessionsRepository };
  }

  const viva = (extra: Record<string, unknown> = {}) => ({
    id: 'sid-1',
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    replacedBySessionId: null,
    ...extra,
  });

  const payload = { sub: 'user-1', email: 'a@b.c', sid: 'sid-1' };

  it('deja pasar una sesion viva', async () => {
    const { strategy } = armar(viva());
    await expect(strategy.validate(payload)).resolves.toEqual(usuario);
  });

  it('deja pasar el token de una sesion que rotó hace un instante', async () => {
    const { strategy } = armar(
      viva({
        revokedAt: new Date(Date.now() - 2_000),
        replacedBySessionId: 'sid-2',
      }),
    );

    await expect(strategy.validate(payload)).resolves.toEqual(usuario);
  });

  it('corta cuando la rotación ya quedó lejos', async () => {
    const { strategy } = armar(
      viva({
        revokedAt: new Date(Date.now() - 120_000),
        replacedBySessionId: 'sid-2',
      }),
    );

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  /*
   * Un cierre de sesion deja `replacedBySessionId` vacio: no hay sesion nueva
   * detras, asi que la gracia no aplica y el token muere en el acto.
   */
  it('corta en el acto si la sesión se cerró, no rotó', async () => {
    const { strategy } = armar(
      viva({ revokedAt: new Date(), replacedBySessionId: null }),
    );

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('corta si la sesión ya caducó, aunque acabe de rotar', async () => {
    const { strategy } = armar(
      viva({
        expiresAt: new Date(Date.now() - 1),
        revokedAt: new Date(),
        replacedBySessionId: 'sid-2',
      }),
    );

    await expect(strategy.validate(payload)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('corta si el token no trae sesión asociada', async () => {
    const { strategy, sessionsRepository } = armar(viva());

    await expect(
      strategy.validate({ sub: 'user-1', email: 'a@b.c' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sessionsRepository.findOne).not.toHaveBeenCalled();
  });
});
