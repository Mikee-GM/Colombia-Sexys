import { NotFoundException } from '@nestjs/common';
import { RealtimeController } from './realtime.controller';

/*
 * sseChofer se autentica con PortalAuthGuard (token de portal), no con
 * JwtAuthGuard: no hay `request.user`, solo el usuarioId que deja resuelto
 * el guard via @PortalUser(). Estas pruebas cubren la logica del metodo en
 * si, que es lo que cambio; el guard en si mismo ya tiene sus propias
 * pruebas.
 */
describe('RealtimeController.sseChofer', () => {
  const realtimeEventsService = { getDriverStream: jest.fn() };
  const empleadasRepository = { findOne: jest.fn() };
  const choferesRepository = { findOne: jest.fn() };

  const controller = new RealtimeController(
    realtimeEventsService as any,
    empleadasRepository as any,
    choferesRepository as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('conecta al canal del chofer resuelto por el usuarioId del token', async () => {
    choferesRepository.findOne.mockResolvedValue({ id: 'driver-1' });
    const stream = {} as any;
    realtimeEventsService.getDriverStream.mockReturnValue(stream);

    const result = await controller.sseChofer('user-1');

    expect(choferesRepository.findOne).toHaveBeenCalledWith({
      where: { usuarioId: 'user-1' },
      select: { id: true },
    });
    expect(realtimeEventsService.getDriverStream).toHaveBeenCalledWith(
      'driver-1',
    );
    expect(result).toBe(stream);
  });

  it('rechaza cuando el usuario autenticado no tiene perfil de chofer', async () => {
    choferesRepository.findOne.mockResolvedValue(null);

    await expect(controller.sseChofer('user-2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(realtimeEventsService.getDriverStream).not.toHaveBeenCalled();
  });
});
