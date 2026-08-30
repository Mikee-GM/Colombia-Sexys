import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * El token con el que se entra a los portales de empleada y chofer.
 *
 * Antes solo se comprobaba la firma, y eso dejaba dos agujeros: cerrar sesion
 * no expulsaba del portal --el token seguia sirviendo hasta caducar-- y
 * desactivar una cuenta tampoco. Ademas se aceptaba un tipo `employee_portal`
 * de siete dias sin sesion asociada, imposible de revocar.
 */
describe('AuthService.verifyPortalToken', () => {
  let usuarios: { findOne: jest.Mock };
  let sesiones: { findOne: jest.Mock };
  let jwt: { verifyAsync: jest.Mock };
  let service: AuthService;

  const PAYLOAD_VALIDO = {
    sub: 'user-1',
    email: 'ana@ejemplo.com',
    rol: 'empleada',
    sid: 'sesion-1',
    familyId: 'fam-1',
    type: 'access',
  };

  const sesionViva = () => ({
    id: 'sesion-1',
    expiresAt: new Date(Date.now() + 3_600_000),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    usuarios = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        email: 'ana@ejemplo.com',
        rol: 'empleada',
      }),
    };
    sesiones = { findOne: jest.fn().mockResolvedValue(sesionViva()) };
    jwt = { verifyAsync: jest.fn().mockResolvedValue(PAYLOAD_VALIDO) };
    service = new AuthService(
      usuarios as any,
      sesiones as any,
      jwt as any,
      { getOrThrow: () => 'secreto-de-prueba' } as never,
    );
  });

  it('acepta un token de acceso con sesión viva y cuenta activa', async () => {
    await expect(service.verifyPortalToken('token')).resolves.toEqual({
      sub: 'user-1',
      email: 'ana@ejemplo.com',
      rol: 'empleada',
    });
  });

  /** Cerrar sesion revoca la fila; el portal tiene que enterarse. */
  it('rechaza el token si la sesión fue revocada', async () => {
    sesiones.findOne.mockResolvedValue(null);

    await expect(service.verifyPortalToken('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza el token si la sesión ya caducó', async () => {
    sesiones.findOne.mockResolvedValue({
      id: 'sesion-1',
      expiresAt: new Date(Date.now() - 1_000),
    });

    await expect(service.verifyPortalToken('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza el token si la cuenta se desactivó', async () => {
    usuarios.findOne.mockResolvedValue(null);

    await expect(service.verifyPortalToken('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  /**
   * Los de siete dias no llevaban sesion, asi que no habia forma de revocarlos.
   * Dejaron de emitirse, pero se seguian aceptando.
   */
  it('ya no acepta los antiguos tokens de portal de siete días', async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: 'user-1',
      email: 'ana@ejemplo.com',
      rol: 'empleada',
      type: 'employee_portal',
    });

    await expect(service.verifyPortalToken('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(sesiones.findOne).not.toHaveBeenCalled();
  });

  it('rechaza un token de acceso sin sesión asociada', async () => {
    jwt.verifyAsync.mockResolvedValue({ ...PAYLOAD_VALIDO, sid: undefined });

    await expect(service.verifyPortalToken('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rechaza un token con la firma mal', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('invalid signature'));

    await expect(service.verifyPortalToken('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
