import { BadRequestException, ConflictException } from '@nestjs/common';
import { ServicesService } from './services.service';

describe('ServicesService transport settlement', () => {
  const serviciosRepository = {
    update: jest.fn(),
    findOne: jest.fn(),
    findOneBy: jest.fn(),
  };
  const viajesRepository = {
    update: jest.fn(),
    findOne: jest.fn(),
  };
  const usuariosRepository = { findOneBy: jest.fn() };
  const conversationsRepository = {
    create: jest.fn((value) => value),
    save: jest.fn(),
  };
  const realtime = {
    emitToJefes: jest.fn(),
    emitToBoss: jest.fn(),
    emitToClient: jest.fn(),
    emitToEmployee: jest.fn(),
  };
  const bot = {
    telegram: {
      sendMessage: jest.fn(),
      editMessageText: jest.fn(),
      deleteForumTopic: jest.fn(),
    },
  };
  const loyalty = { awardForFinalizedService: jest.fn() };
  const liquidationSync = { syncOfficeRecord: jest.fn() };

  const service = new ServicesService(
    serviciosRepository as any,
    viajesRepository as any,
    {} as any,
    usuariosRepository as any,
    conversationsRepository as any,
    realtime as any,
    bot as any,
    {} as any,
    {} as any,
    loyalty as any,
    liquidationSync as any,
    { get: jest.fn() } as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('rechaza una tarifa inválida sin modificar el viaje', async () => {
    await expect(
      service.confirmUberFare('trip', 'boss', 0),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(viajesRepository.update).not.toHaveBeenCalled();
  });

  it('reemplaza la tarifa del regreso sin cerrar la liquidación', async () => {
    viajesRepository.findOne.mockResolvedValue({
      id: 'trip',
      tipo: 'regreso',
      servicioId: 'service',
      proveedorTransporte: 'uber',
      telegramUberFileId: 'photo',
      servicio: { jefeId: 'boss', empleada: { usuario: {} } },
    });
    usuariosRepository.findOneBy.mockResolvedValue({ id: 'boss', rol: 'jefe' });
    serviciosRepository.findOneBy.mockResolvedValue({
      totalTransporte: 235.5,
      totalFinal: 1235.5,
    });
    const receiptSpy = jest
      .spyOn(service, 'sendFinalReceiptAndAward')
      .mockResolvedValue();

    await service.confirmUberFare('trip', 'boss', 185.5);

    expect(viajesRepository.update).toHaveBeenCalledWith(
      'trip',
      expect.objectContaining({ tarifa: 185.5 }),
    );
    expect(serviciosRepository.update).not.toHaveBeenCalled();
    expect(receiptSpy).toHaveBeenCalledWith('service');
  });

  it('impide que otra empleada actualice el estado del Uber', async () => {
    viajesRepository.findOne.mockResolvedValue({
      id: 'trip',
      estado: 'aceptado',
      proveedorTransporte: 'uber',
      servicio: {
        jefeId: 'boss',
        empleada: { usuarioId: 'assigned-user', usuario: {} },
      },
    });
    usuariosRepository.findOneBy.mockResolvedValue({
      id: 'other-user',
      rol: 'empleada',
    });

    await expect(
      service.updateUberStatus('trip', 'other-user', 'employee_en_route'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(viajesRepository.update).not.toHaveBeenCalled();
  });

  it('permite al jefe marcar que el Uber llegó después de ir en camino', async () => {
    viajesRepository.findOne.mockResolvedValue({
      id: 'trip',
      estado: 'en_camino',
      proveedorTransporte: 'uber',
      servicioId: 'service',
      servicio: {
        jefeId: 'boss',
        empleadaId: 'employee',
        empleada: { usuario: { telegramChatId: '123' } },
      },
    });
    usuariosRepository.findOneBy.mockResolvedValue({
      id: 'boss',
      rol: 'jefe',
    });

    await service.updateUberStatus('trip', 'boss', 'uber_arrived');

    expect(viajesRepository.update).toHaveBeenCalledWith('trip', {
      estado: 'llegado',
    });
    const keyboard = bot.telegram.sendMessage.mock.calls[0][2];
    const callbackData =
      keyboard.reply_markup.inline_keyboard[0][0].callback_data;
    expect(Buffer.byteLength(callbackData, 'utf8')).toBeLessThanOrEqual(64);
  });

  it('exige tarifa antes de marcar el Uber en camino', async () => {
    viajesRepository.findOne.mockResolvedValue({
      id: 'trip',
      estado: 'aceptado',
      tarifa: 0,
      proveedorTransporte: 'uber',
      servicio: { jefeId: 'boss', empleada: { usuario: {} } },
    });
    usuariosRepository.findOneBy.mockResolvedValue({ id: 'boss', rol: 'jefe' });

    await expect(
      service.updateUberStatus('trip', 'boss', 'uber_en_route'),
    ).rejects.toThrow('Primero registra la tarifa');
    expect(viajesRepository.update).not.toHaveBeenCalled();
  });

  it('cierra el regreso solamente cuando la empleada confirma su llegada', async () => {
    viajesRepository.findOne.mockResolvedValue({
      id: 'trip',
      servicioId: 'service',
      tipo: 'regreso',
      estado: 'en_curso',
      proveedorTransporte: 'uber',
      servicio: {
        jefeId: 'boss',
        clienteId: 'client',
        empleadaId: 'employee',
        empleada: { usuarioId: 'employee-user', usuario: {} },
      },
    });
    usuariosRepository.findOneBy.mockResolvedValue({
      id: 'employee-user',
      rol: 'empleada',
    });

    await service.updateUberStatus('trip', 'employee-user', 'employee_arrived');

    expect(viajesRepository.update).toHaveBeenCalledWith(
      'trip',
      expect.objectContaining({ estado: 'finalizado' }),
    );
    expect(serviciosRepository.update).toHaveBeenCalledWith(
      'service',
      expect.objectContaining({ estadoLiquidacion: 'cerrada' }),
    );
  });

  it('envía la confirmación de la empleada al tema asignado', async () => {
    viajesRepository.findOne.mockResolvedValue({
      id: 'trip',
      servicioId: 'service',
      tipo: 'ida',
      estado: 'aceptado',
      proveedorTransporte: 'uber',
      servicio: {
        id: 'service',
        jefeId: 'boss',
        clienteId: 'client',
        empleadaId: 'employee',
        telegramThreadId: '77',
        jefe: { grupoTelegramId: '-100123' },
        empleada: {
          nombreArtistico: 'Andrea',
          usuarioId: 'employee-user',
          usuario: {},
        },
      },
    });
    usuariosRepository.findOneBy.mockResolvedValue({
      id: 'employee-user',
      rol: 'empleada',
    });

    await service.updateUberStatus(
      'trip',
      'employee-user',
      'employee_en_route',
    );

    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
      '-100123',
      expect.stringContaining('dentro del Uber de ida'),
      { message_thread_id: 77 },
    );
  });

  it('elimina el tema cuando termina el regreso en Uber', async () => {
    viajesRepository.findOne.mockResolvedValue({
      id: 'trip',
      servicioId: 'service',
      tipo: 'regreso',
      estado: 'en_curso',
      proveedorTransporte: 'uber',
      servicio: {
        id: 'service',
        jefeId: 'boss',
        clienteId: 'client',
        empleadaId: 'employee',
        telegramThreadId: '88',
        jefe: { grupoTelegramId: '-100456' },
        empleada: {
          nombreArtistico: 'Andrea',
          usuarioId: 'employee-user',
          usuario: {},
        },
      },
    });
    usuariosRepository.findOneBy.mockResolvedValue({
      id: 'employee-user',
      rol: 'empleada',
    });

    await service.updateUberStatus('trip', 'employee-user', 'employee_arrived');

    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
      '-100456',
      expect.stringContaining('llegó al destino del viaje de regreso'),
      { message_thread_id: 88 },
    );
    expect(bot.telegram.deleteForumTopic).not.toHaveBeenCalled();
  });

  it('cambia un viaje pendiente de chofer a Uber', async () => {
    const trip = {
      id: 'trip',
      servicioId: 'service',
      tipo: 'ida',
      estado: 'notificado',
      proveedorTransporte: 'interno',
      choferId: null,
      choferesNotificados: [],
      telegramChoferMsgOfertaId: null,
    };
    const manager = {
      findOne: jest.fn().mockResolvedValue(trip),
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce({ id: 'service', jefeId: 'boss' })
        .mockResolvedValueOnce({ id: 'boss', rol: 'jefe' }),
      save: jest.fn().mockImplementation((_entity, value) => value),
      update: jest.fn(),
    };
    (serviciosRepository as any).manager = {
      transaction: jest.fn((callback) => callback(manager)),
    };
    serviciosRepository.findOne.mockResolvedValue({
      id: 'service',
      jefeId: 'boss',
      ubicacionClienteLat: 1,
      ubicacionClienteLng: 2,
      empleada: { ubicacionLat: 3, ubicacionLng: 4, usuario: {} },
      jefe: {},
    });

    const result = await service.changeTripTransport('trip', 'boss', 'uber');

    expect(result.trip.proveedorTransporte).toBe('uber');
    expect(result.trip.estado).toBe('aceptado');
    expect(result.trip.tarifa).toBe(0);
    expect(result.uberLink).toBeUndefined();
    expect(realtime.emitToBoss).toHaveBeenCalledWith(
      'boss',
      expect.objectContaining({ type: 'trip_transport_changed' }),
    );
  });

  it('impide cambiar el transporte cuando el viaje está en curso', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'trip',
        servicioId: 'service',
        estado: 'en_curso',
        proveedorTransporte: 'interno',
      }),
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce({ id: 'service', jefeId: 'boss' })
        .mockResolvedValueOnce({ id: 'boss', rol: 'jefe' }),
    };
    (serviciosRepository as any).manager = {
      transaction: jest.fn((callback) => callback(manager)),
    };

    await expect(
      service.changeTripTransport('trip', 'boss', 'uber'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('impide cambiar el transporte si ya existe un chofer asignado', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'trip',
        servicioId: 'service',
        estado: 'notificado',
        proveedorTransporte: 'interno',
        choferId: 'driver',
      }),
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce({ id: 'service', jefeId: 'boss' })
        .mockResolvedValueOnce({ id: 'boss', rol: 'jefe' }),
    };
    (serviciosRepository as any).manager = {
      transaction: jest.fn((callback) => callback(manager)),
    };

    await expect(
      service.changeTripTransport('trip', 'boss', 'uber'),
    ).rejects.toThrow('el viaje ya tiene un chofer asignado');
  });
});
