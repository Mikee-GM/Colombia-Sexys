import { BadRequestException, ConflictException } from '@nestjs/common';
import { ServicesService } from './services.service';
import { operationStateFromLegacy } from './operations/service-operation-state';

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
      sendPhoto: jest.fn(),
      getFileLink: jest.fn(),
      editMessageText: jest.fn(),
      deleteForumTopic: jest.fn(),
    },
  };
  const loyalty = { awardForFinalizedService: jest.fn() };
  const aiMessageService = {
    generate: jest.fn().mockResolvedValue('Mensaje IA'),
    generateAgencyMessage: jest.fn().mockResolvedValue('Mensaje Agencia'),
  };
  const liquidationSync = {
    syncOfficeRecord: jest.fn().mockResolvedValue(null),
  };
  const uploadService = {
    uploadEvidence: jest.fn(),
    uploadEvidenceFromUrl: jest.fn(),
  };
  const serviceOperations = {
    currentState: jest.fn(
      (item) => item.operationalState ?? operationStateFromLegacy(item),
    ),
    transition: jest.fn().mockResolvedValue(undefined),
    recordEvent: jest.fn().mockResolvedValue(undefined),
  };

  /*
   * Se construye por nombre y no con `new`.
   *
   * Con la lista posicional, cada dependencia nueva del servicio --y son mas de
   * veinte-- desplazaba todos los dobles y estas pruebas fallaban por un motivo
   * ajeno a lo que probaban. El registro y los dos relojes en memoria entran como
   * dobles porque `Object.create` no ejecuta los campos inicializados.
   */
  const service = Object.create(ServicesService.prototype) as ServicesService;
  Object.assign(service, {
    logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
    waitTimeouts: new Map(),
    dispatchTimeouts: new Map(),
    serviciosRepository,
    viajesRepository,
    choferesRepository: {},
    usuariosRepository,
    conversationsRepository,
    bankAccountsRepository: {},
    paymentReceiptValidationsRepository: {},
    realtimeEventsService: realtime,
    bot,
    telegramService: {},
    aiMessageService,
    loyaltyService: loyalty,
    liquidationSync,
    configService: { get: jest.fn() },
    disciplineService: {},
    uploadService,
    // empleadas, clientes y sesiones: solo los usa el cierre por la empleada.
    empleadasRepository: { findOne: jest.fn() },
    clientesRepository: {},
    telegramSessionRepository: {},
    // catalogo de extras, extras cobrados y participantes: solo los usa
    // agregar un extra. Ninguna de las dos cosas se ejercita aqui.
    extrasCatalogoRepository: {},
    extrasServicioRepository: {},
    serviceParticipantsRepository: {},
    serviceOperations,
    notificationsService: { notificar: jest.fn().mockResolvedValue(1) },
  });

  beforeEach(() => jest.clearAllMocks());

  it('rechaza una tarifa inválida sin modificar el viaje', async () => {
    await expect(
      service.confirmUberFare('trip', 'boss', 0),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(viajesRepository.update).not.toHaveBeenCalled();
  });

  it('almacena en R2 antes de enviar una captura cargada desde el panel', async () => {
    viajesRepository.findOne.mockResolvedValue({
      id: 'trip',
      tipo: 'ida',
      proveedorTransporte: 'uber',
      servicio: {
        jefeId: 'boss',
        empleada: { usuario: { telegramChatId: '123' } },
      },
    });
    usuariosRepository.findOneBy.mockResolvedValue({ id: 'boss', rol: 'jefe' });
    uploadService.uploadEvidence.mockResolvedValue({
      url: 'https://media.example.com/evidencias/uber/trip/image.jpg',
    });
    bot.telegram.sendPhoto.mockResolvedValue({
      photo: [{ file_id: 'telegram-photo' }],
    });

    const result = await service.saveUberScreenshotFromDashboard(
      'trip',
      'boss',
      {
        buffer: Buffer.from('image'),
        mimetype: 'image/jpeg',
        originalname: 'uber.jpg',
      },
    );

    expect(uploadService.uploadEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ folder: 'uber', scopeId: 'trip' }),
    );
    expect(
      uploadService.uploadEvidence.mock.invocationCallOrder[0],
    ).toBeLessThan(viajesRepository.update.mock.invocationCallOrder[0]);
    expect(viajesRepository.update.mock.invocationCallOrder[0]).toBeLessThan(
      bot.telegram.sendPhoto.mock.invocationCallOrder[0],
    );
    expect(viajesRepository.update).toHaveBeenLastCalledWith(
      'trip',
      expect.objectContaining({
        telegramUberFileId: 'telegram-photo',
        uberScreenshotUrl:
          'https://media.example.com/evidencias/uber/trip/image.jpg',
      }),
    );
    expect(result.imageUrl).toContain('/evidencias/uber/');
  });

  it('no envía ni registra la captura si falla R2', async () => {
    viajesRepository.findOne.mockResolvedValue({
      id: 'trip',
      tipo: 'ida',
      proveedorTransporte: 'uber',
      servicio: {
        jefeId: 'boss',
        empleada: { usuario: { telegramChatId: '123' } },
      },
    });
    usuariosRepository.findOneBy.mockResolvedValue({ id: 'boss', rol: 'jefe' });
    uploadService.uploadEvidence.mockRejectedValue(new Error('R2 unavailable'));

    await expect(
      service.saveUberScreenshotFromDashboard('trip', 'boss', {
        buffer: Buffer.from('image'),
        mimetype: 'image/jpeg',
        originalname: 'uber.jpg',
      }),
    ).rejects.toThrow('R2 unavailable');

    expect(bot.telegram.sendPhoto).not.toHaveBeenCalled();
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
    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
      '123',
      expect.stringContaining('portal web'),
    );
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

  it('registra plataforma, enlace y costo externo sin finalizar el viaje', async () => {
    const serviceRow = {
      id: 'service',
      jefeId: 'boss',
      empleadaId: 'employee',
      operationalState: 'esperando_transporte_ida',
    };
    const tripRow = {
      id: 'trip',
      servicioId: 'service',
      tipo: 'ida',
      estado: 'aceptado',
      proveedorTransporte: 'uber',
      externalPlatform: null,
      externalSharedLink: null,
      tarifa: 0,
      fareConfirmedAt: null,
      choferId: null,
    };
    const serviceRepository = {
      createQueryBuilder: jest.fn(() => ({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(serviceRow),
      })),
    };
    const manager = {
      getRepository: jest.fn(() => serviceRepository),
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce({ id: 'boss', rol: 'jefe' })
        .mockResolvedValueOnce({
          id: 'employee',
          usuarioId: 'employee-user',
          jefeId: 'boss',
          jefeSecundarioId: null,
        }),
      findOne: jest.fn().mockResolvedValue(tripRow),
      create: jest.fn((_entity, value) => value),
      save: jest.fn((_entity, value) => value),
    };
    (serviciosRepository as any).manager = {
      transaction: jest.fn((callback) => callback(manager)),
    };
    (service as any).empleadasRepository.findOne = jest.fn().mockResolvedValue({
      usuario: { telegramChatId: null },
    });

    await service.assignExternalTransport('service', 'boss', {
      platform: 'DiDi',
      sharedLink: 'https://example.test/trip/123',
      amount: 175.5,
    });

    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        externalPlatform: 'DiDi',
        externalSharedLink: 'https://example.test/trip/123',
        tarifa: 175.5,
        fareConfirmedAt: expect.any(Date),
      }),
    );
    expect(serviceOperations.transition).toHaveBeenCalledWith(
      'service',
      'asignar_transporte_ida',
      { userId: 'boss', type: 'jefe' },
      expect.objectContaining({
        eventType: 'EXTERNAL_TRANSPORT_ASSIGNED',
      }),
    );
    serviceRow.operationalState = 'transporte_ida_asignado';
    manager.findOneBy
      .mockResolvedValueOnce({ id: 'boss', rol: 'jefe' })
      .mockResolvedValueOnce({
        id: 'employee',
        usuarioId: 'employee-user',
        jefeId: 'boss',
        jefeSecundarioId: null,
      });
    const saves = manager.save.mock.calls.length;
    await service.assignExternalTransport('service', 'boss', {
      platform: 'DiDi',
      sharedLink: 'https://example.test/trip/123',
      amount: 175.5,
    });
    expect(manager.save).toHaveBeenCalledTimes(saves);
  });

  it.each([
    [
      { platform: '', sharedLink: 'https://example.test/trip', amount: 10 },
      'plataforma',
    ],
    [{ platform: 'Uber', sharedLink: '', amount: 10 }, 'enlace'],
    [
      { platform: 'Uber', sharedLink: 'https://example.test/trip', amount: 0 },
      'costo',
    ],
    [
      { platform: 'Uber', sharedLink: 'http://example.test/trip', amount: 10 },
      'HTTPS',
    ],
  ])('rechaza transporte externo sin %s', async (input) => {
    await expect(
      service.assignExternalTransport('service', 'boss', input),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('asigna regreso externo sin crear un paso de captura', async () => {
    const serviceRow = {
      id: 'service',
      jefeId: 'boss',
      empleadaId: 'employee',
      operationalState: 'preparando_regreso',
    };
    const serviceRepository = {
      createQueryBuilder: jest.fn(() => ({
        setLock: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(serviceRow),
      })),
    };
    const manager = {
      getRepository: jest.fn(() => serviceRepository),
      findOneBy: jest
        .fn()
        .mockResolvedValueOnce({ id: 'boss', rol: 'jefe' })
        .mockResolvedValueOnce({
          id: 'employee',
          usuarioId: 'employee-user',
          jefeId: 'boss',
          jefeSecundarioId: null,
        }),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((_entity, value) => ({
        ...value,
        id: 'return-trip',
        proveedorTransporte: 'uber',
      })),
      save: jest.fn((_entity, value) => value),
    };
    (serviciosRepository as any).manager = {
      transaction: jest.fn((callback) => callback(manager)),
    };
    (service as any).empleadasRepository.findOne = jest.fn().mockResolvedValue({
      usuario: { telegramChatId: null },
    });

    const result = await service.assignExternalTransport('service', 'boss', {
      platform: 'Otro',
      sharedLink: 'https://example.test/return',
      amount: 88.25,
    });

    expect(result.id).toBe('return-trip');
    expect(manager.save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        externalPlatform: 'Otro',
        externalSharedLink: 'https://example.test/return',
        tarifa: 88.25,
        fareConfirmedAt: expect.any(Date),
      }),
    );
    expect(serviceOperations.transition).toHaveBeenCalledWith(
      'service',
      'asignar_transporte_regreso',
      { userId: 'boss', type: 'jefe' },
      expect.objectContaining({ eventType: 'EXTERNAL_TRANSPORT_ASSIGNED' }),
    );
  });

  /*
   * El cierre de la liquidacion se comprueba sobre el servicio entero.
   *
   * Antes lo decidia cada paso por su cuenta mirando solo el viaje que tenia
   * delante, y de ahi salian las dos formas de romperlo: cerrar con el Uber de
   * ida sin tarifa, o no cerrar nunca por haber hecho los pasos en otro orden.
   */
  const servicioConViajes = (viajes: Record<string, unknown>[]) => ({
    id: 'service',
    jefeId: 'boss',
    estado: 'finalizado',
    estadoLiquidacion: 'transporte_pendiente',
    viajes,
  });

  const llegadaDelRegreso = () => {
    viajesRepository.findOne.mockResolvedValue({
      id: 'trip',
      servicioId: 'service',
      tipo: 'regreso',
      estado: 'en_curso',
      proveedorTransporte: 'uber',
      fareConfirmedAt: null,
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
  };

  it('no cierra el regreso en Uber hasta que se confirme la tarifa', async () => {
    llegadaDelRegreso();
    serviciosRepository.findOne.mockResolvedValue(
      servicioConViajes([
        {
          tipo: 'regreso',
          estado: 'finalizado',
          proveedorTransporte: 'uber',
          fareConfirmedAt: null,
        },
      ]),
    );

    await service.updateUberStatus('trip', 'employee-user', 'employee_arrived');

    expect(viajesRepository.update).toHaveBeenCalledWith(
      'trip',
      expect.objectContaining({ estado: 'finalizado' }),
    );
    expect(serviciosRepository.update).not.toHaveBeenCalledWith(
      'service',
      expect.objectContaining({ estadoLiquidacion: 'cerrada' }),
    );
  });

  it('no cierra mientras el Uber de ida siga sin tarifa', async () => {
    llegadaDelRegreso();
    serviciosRepository.findOne.mockResolvedValue(
      servicioConViajes([
        {
          tipo: 'ida',
          estado: 'finalizado',
          proveedorTransporte: 'uber',
          fareConfirmedAt: null,
        },
        {
          tipo: 'regreso',
          estado: 'finalizado',
          proveedorTransporte: 'uber',
          fareConfirmedAt: new Date(),
        },
      ]),
    );

    await service.updateUberStatus('trip', 'employee-user', 'employee_arrived');

    expect(serviciosRepository.update).not.toHaveBeenCalledWith(
      'service',
      expect.objectContaining({ estadoLiquidacion: 'cerrada' }),
    );
  });

  it('cierra cuando los dos viajes estan terminados y con tarifa', async () => {
    llegadaDelRegreso();
    serviciosRepository.findOne.mockResolvedValue(
      servicioConViajes([
        {
          tipo: 'ida',
          estado: 'finalizado',
          proveedorTransporte: 'uber',
          fareConfirmedAt: new Date(),
        },
        {
          tipo: 'regreso',
          estado: 'finalizado',
          proveedorTransporte: 'uber',
          fareConfirmedAt: new Date(),
        },
      ]),
    );

    await service.updateUberStatus('trip', 'employee-user', 'employee_arrived');

    expect(serviciosRepository.update).toHaveBeenCalledWith('service', {
      estadoLiquidacion: 'cerrada',
    });
  });

  it('permite repetir la llegada si el viaje ya se guardó como finalizado', async () => {
    viajesRepository.findOne.mockResolvedValue({
      id: 'trip',
      servicioId: 'service',
      tipo: 'regreso',
      estado: 'finalizado',
      proveedorTransporte: 'uber',
      servicio: {
        jefeId: 'boss',
        clienteId: 'client',
        empleadaId: 'employee',
        horaLlegadaCasa: new Date(),
        empleada: { usuarioId: 'employee-user', usuario: {} },
      },
    });
    usuariosRepository.findOneBy.mockResolvedValue({
      id: 'employee-user',
      rol: 'empleada',
    });

    await expect(
      service.updateUberStatus('trip', 'employee-user', 'employee_arrived'),
    ).resolves.toBeUndefined();

    expect(viajesRepository.update).not.toHaveBeenCalled();
    expect(liquidationSync.syncOfficeRecord).toHaveBeenCalledWith('service');
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

  it('impide cambiar el transporte si ya existe un chofer asignado que aceptó el viaje', async () => {
    const manager = {
      findOne: jest.fn().mockResolvedValue({
        id: 'trip',
        servicioId: 'service',
        estado: 'aceptado',
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

  it('deja el inicio en manos de la empleada después de llegar en Uber', async () => {
    const assignedService = {
      id: 'service',
      jefeId: 'boss',
      estado: 'en_curso',
      operationalState: 'empleada_en_camino',
      empleadaId: 'employee',
      empleada: { usuarioId: 'employee-user', usuario: {} },
    };
    viajesRepository.findOne.mockResolvedValue({
      id: 'trip',
      servicioId: 'service',
      tipo: 'ida',
      estado: 'en_curso',
      proveedorTransporte: 'uber',
      servicio: assignedService,
    });
    usuariosRepository.findOneBy.mockResolvedValue({
      id: 'employee-user',
      rol: 'empleada',
    });
    serviciosRepository.findOne.mockResolvedValue(assignedService);

    await service.updateUberStatus('trip', 'employee-user', 'employee_arrived');

    expect(serviciosRepository.update).not.toHaveBeenCalledWith(
      'service',
      expect.objectContaining({ horaInicioServicio: expect.any(Date) }),
    );
    expect(serviceOperations.transition).toHaveBeenCalledWith(
      'service',
      'empleada_llega',
      expect.objectContaining({ type: 'empleada' }),
      expect.objectContaining({ eventType: 'EMPLOYEE_ARRIVED' }),
    );
    expect(realtime.emitToBoss).not.toHaveBeenCalledWith(
      'boss',
      expect.objectContaining({ type: 'scheduled_service_started' }),
    );
  });

  it('tampoco inicia automáticamente una cita agendada al llegar en Uber', async () => {
    const scheduledService = {
      id: 'service',
      jefeId: 'boss',
      estado: 'agendado',
      operationalState: 'empleada_en_camino',
      empleadaId: 'employee',
      empleada: { usuarioId: 'employee-user', usuario: {} },
    };
    viajesRepository.findOne.mockResolvedValue({
      id: 'trip',
      servicioId: 'service',
      tipo: 'ida',
      estado: 'en_curso',
      proveedorTransporte: 'uber',
      servicio: scheduledService,
    });
    usuariosRepository.findOneBy.mockResolvedValue({
      id: 'employee-user',
      rol: 'empleada',
    });
    serviciosRepository.findOne.mockResolvedValue(scheduledService);

    await service.updateUberStatus('trip', 'employee-user', 'employee_arrived');

    expect(serviciosRepository.update).not.toHaveBeenCalledWith(
      'service',
      expect.objectContaining({ estado: 'en_curso' }),
    );
  });

  it('avisa al jefe cuando falta la ubicación de la empleada para despachar el viaje de ida', async () => {
    viajesRepository.findOne.mockResolvedValue({
      id: 'trip',
      tipo: 'ida',
      estado: 'notificado',
      choferesNotificados: [],
      servicio: {
        id: 'service',
        jefeId: 'boss',
        telegramThreadId: '99',
        jefe: { grupoTelegramId: '-100999' },
        empleada: { ubicacionLat: null, ubicacionLng: null },
      },
      passengers: [],
    });
    bot.telegram.sendMessage.mockResolvedValue({});

    await service.dispatchViaje('trip');

    expect(realtime.emitToBoss).toHaveBeenCalledWith(
      'boss',
      expect.objectContaining({ type: 'no_drivers_available' }),
    );
    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
      '-100999',
      expect.stringContaining('ubicación de la empleada'),
      expect.objectContaining({ message_thread_id: 99 }),
    );
  });

  it('avisa al jefe cuando falta la ubicación del cliente para despachar el viaje de regreso', async () => {
    viajesRepository.findOne.mockResolvedValue({
      id: 'trip',
      tipo: 'regreso',
      estado: 'notificado',
      choferesNotificados: [],
      servicio: {
        id: 'service',
        jefeId: 'boss',
        telegramThreadId: '99',
        jefe: { grupoTelegramId: '-100999' },
        ubicacionClienteLat: null,
        ubicacionClienteLng: null,
      },
      passengers: [],
    });
    bot.telegram.sendMessage.mockResolvedValue({});

    await service.dispatchViaje('trip');

    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
      '-100999',
      expect.stringContaining('ubicación del cliente'),
      expect.objectContaining({ message_thread_id: 99 }),
    );
  });
});
