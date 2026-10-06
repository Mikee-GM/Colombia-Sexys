import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ServicesService } from './services.service';

describe('ServicesService.activatePanic', () => {
  const active = (overrides: Record<string, unknown> = {}) => ({
    id: 'service-1',
    estado: 'en_curso',
    operationalState: 'en_curso',
    empleadaId: 'employee-1',
    jefeId: 'boss-1',
    habitacion: '204',
    locationNameSnapshot: 'Motel Centro',
    locationAddressSnapshot: 'Calle 1',
    empleada: {
      usuarioId: 'employee-user',
      ubicacionLat: 4.61,
      ubicacionLng: -74.08,
      ultimaUbicacionAt: new Date('2026-10-05T12:00:00.000Z'),
      usuario: {},
    },
    jefe: { telegramChatId: null, grupoTelegramId: null },
    ...overrides,
  });

  function setup(row = active()) {
    const recordEvent = jest.fn().mockResolvedValue({ id: 'event-1' });
    const realtime = {
      emitToBoss: jest.fn(),
      emitToEmployee: jest.fn(),
    };
    const notifications = { notificar: jest.fn().mockResolvedValue(1) };
    const service = Object.create(ServicesService.prototype) as ServicesService;
    Object.assign(service, {
      logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      serviciosRepository: { findOne: jest.fn().mockResolvedValue(row) },
      serviceOperations: {
        currentState: jest.fn(() => row.operationalState),
        recordEvent,
      },
      realtimeEventsService: realtime,
      notificationsService: notifications,
      bot: {
        telegram: { sendMessage: jest.fn().mockResolvedValue(undefined) },
      },
    });
    return { service, recordEvent, realtime, notifications };
  }

  it('registra contexto y alerta al jefe desde el backend', async () => {
    const { service, recordEvent, realtime, notifications } = setup();

    const result = await service.activatePanic('service-1', 'employee-user');

    expect(result.eventId).toBe('event-1');
    expect(recordEvent).toHaveBeenCalledWith(
      'service-1',
      'SERVICE_PANIC_ACTIVATED',
      { userId: 'employee-user', type: 'empleada' },
      expect.objectContaining({
        priority: 'critical',
        operationalState: 'en_curso',
        location: expect.objectContaining({ lat: 4.61, lng: -74.08 }),
      }),
    );
    expect(realtime.emitToBoss).toHaveBeenCalledWith(
      'boss-1',
      expect.objectContaining({ priority: 'critical' }),
    );
    expect(notifications.notificar).toHaveBeenCalledWith(
      'boss-1',
      expect.objectContaining({ requireInteraction: true }),
    );
  });

  it('rechaza a una persona distinta de la empleada asignada', async () => {
    const { service, recordEvent } = setup();

    await expect(
      service.activatePanic('service-1', 'another-user'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it('no registra pánico cuando el servicio ya no está activo', async () => {
    const { service, recordEvent } = setup(
      active({ operationalState: 'preparando_regreso' }),
    );

    await expect(
      service.activatePanic('service-1', 'employee-user'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(recordEvent).not.toHaveBeenCalled();
  });
});
