import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

/**
 * Que se le contesta a quien prueba correos en el login.
 *
 * Antes se distinguian tres casos desde fuera: el correo que no existe fallaba
 * al instante, el que existe tardaba lo que tarda bcrypt, y el de una cuenta
 * dada de baja contestaba "Usuario inactivo" sin pedir siquiera la contrasena.
 * Con eso se podia averiguar quien tiene cuenta en la empresa antes de intentar
 * adivinar ninguna clave.
 */
describe('AuthService.login: no se puede averiguar quién tiene cuenta', () => {
  const CLAVE = 'clave-correcta';
  let hash: string;
  let usuario: Record<string, unknown> | null;
  let service: AuthService;
  let advertencias: string[];

  beforeAll(() => {
    hash = bcrypt.hashSync(CLAVE, 10);
  });

  beforeEach(() => {
    usuario = {
      id: 'user-1',
      email: 'ana@ejemplo.com',
      rol: 'jefe',
      activo: true,
      passwordHash: hash,
    };
    const usuarios = {
      createQueryBuilder: () => ({
        addSelect: () => ({
          where: () => ({ getOne: () => Promise.resolve(usuario) }),
        }),
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    service = new AuthService(
      usuarios as never,
      { manager: {} } as never,
      {} as never,
      { getOrThrow: () => 'secreto-de-prueba' } as never,
    );
    advertencias = [];
    jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation((mensaje: unknown) => {
        advertencias.push(String(mensaje));
      });
    jest
      .spyOn(
        service as unknown as { createTokenPair: () => unknown },
        'createTokenPair',
      )
      .mockResolvedValue({ accessToken: 'a' } as never);
  });

  const login = () =>
    service.login({ email: 'ana@ejemplo.com', password: CLAVE }, 'dispositivo');

  it('deja entrar con la contraseña correcta', async () => {
    await expect(login()).resolves.toEqual({ accessToken: 'a' });
  });

  it('responde lo mismo con un correo desconocido que con una clave mala', async () => {
    usuario = null;
    const desconocido = await login().catch((e: Error) => e.message);

    usuario = {
      id: 'user-1',
      email: 'ana@ejemplo.com',
      rol: 'jefe',
      activo: true,
      passwordHash: bcrypt.hashSync('otra', 10),
    };
    const claveMala = await login().catch((e: Error) => e.message);

    expect(desconocido).toBe('Credenciales inválidas');
    expect(claveMala).toBe('Credenciales inválidas');
  });

  /**
   * El coste de bcrypt tambien tiene que pagarse cuando no hay a quien buscar.
   * Sin la comparacion de relleno esto vuelve inmediato, y esa diferencia es la
   * que delataba que el correo no existe.
   */
  it('tarda lo mismo aunque el correo no exista', async () => {
    usuario = null;
    const antes = Date.now();

    await expect(login()).rejects.toBeInstanceOf(UnauthorizedException);

    expect(Date.now() - antes).toBeGreaterThan(10);
  });

  it('deja rastro del intento fallido', async () => {
    usuario = null;
    await login().catch(() => undefined);

    expect(advertencias.join(' ')).toContain('ana@ejemplo.com');
    // Nunca la contrasena probada.
    expect(advertencias.join(' ')).not.toContain(CLAVE);
  });

  /** Solo lo ve quien ya acerto la contrasena, asi que no delata a nadie. */
  it('avisa de la cuenta desactivada solo tras acertar la contraseña', async () => {
    usuario = { ...usuario, activo: false };

    await expect(login()).rejects.toThrow('Usuario inactivo');
  });

  it('a la cuenta desactivada con la clave mala le dice lo de siempre', async () => {
    usuario = {
      id: 'user-1',
      email: 'ana@ejemplo.com',
      rol: 'jefe',
      activo: false,
      passwordHash: bcrypt.hashSync('otra', 10),
    };

    await expect(login()).rejects.toThrow('Credenciales inválidas');
  });
});
