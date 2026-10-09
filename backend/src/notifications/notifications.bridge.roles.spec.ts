import { NotificationsBridge } from './notifications.bridge';

describe('NotificationsBridge: avisos por rol', () => {
  function build() {
    const notificar = jest.fn().mockResolvedValue(1);
    const bridge = Object.create(
      NotificationsBridge.prototype,
    ) as NotificationsBridge;
    Object.assign(bridge, {
      logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      notifications: { notificar },
      realtime: {},
      empleadas: {
        findOne: jest.fn().mockResolvedValue({ usuarioId: 'employee-user' }),
      },
      choferes: {
        findOne: jest.fn().mockResolvedValue({ usuarioId: 'driver-user' }),
      },
      usuarios: {
        find: jest.fn().mockResolvedValue([{ id: 'admin-user' }]),
      },
    });
    const dispatch = (message: unknown) =>
      (
        bridge as unknown as { alEvento(message: unknown): Promise<void> }
      ).alEvento(message);
    return { notificar, dispatch };
  }

  it('resuelve el perfil de empleada a su usuario y no incluye PII', async () => {
    const { notificar, dispatch } = build();

    await dispatch({
      target: 'employee',
      key: 'employee-profile',
      event: {
        type: 'new_service',
        data: {
          id: '11111111-1111-4111-8111-111111111111',
          clientName: 'Nombre Privado',
          address: 'Direccion Privada',
        },
      },
    });

    expect(notificar).toHaveBeenCalledWith(
      'employee-user',
      expect.objectContaining({
        titulo: 'Tienes un nuevo servicio',
        dedupeKey: 'employee:new_service:11111111-1111-4111-8111-111111111111',
      }),
    );
    expect(JSON.stringify(notificar.mock.calls[0][1])).not.toMatch(
      /Nombre Privado|Direccion Privada/,
    );
  });

  it('resuelve el perfil de chofer y mantiene estable la clave de la oferta', async () => {
    const { notificar, dispatch } = build();
    const message = {
      target: 'driver',
      key: 'driver-profile',
      event: {
        type: 'trip_offered',
        data: {
          tripId: '22222222-2222-4222-8222-222222222222',
          servicioId: '33333333-3333-4333-8333-333333333333',
        },
      },
    };

    await dispatch(message);
    await dispatch(message);

    expect(notificar).toHaveBeenCalledTimes(2);
    expect(notificar.mock.calls[0][1].dedupeKey).toBe(
      notificar.mock.calls[1][1].dedupeKey,
    );
    expect(notificar.mock.calls[0][0]).toBe('driver-user');
  });

  it('solo escala al admin los eventos criticos configurados', async () => {
    const { notificar, dispatch } = build();

    await dispatch({
      target: 'boss',
      key: 'boss-user',
      event: {
        type: 'SERVICE_PANIC_ACTIVATED',
        data: { serviceId: '44444444-4444-4444-8444-444444444444' },
      },
    });

    expect(notificar).toHaveBeenCalledWith(
      'admin-user',
      expect.objectContaining({
        titulo: 'Alerta de seguridad',
        tipo: 'SERVICE_PANIC_ACTIVATED',
      }),
    );
  });
});
