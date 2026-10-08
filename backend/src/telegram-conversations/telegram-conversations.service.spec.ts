import { ConflictException, ForbiddenException } from '@nestjs/common';
import { TelegramConversationsService } from './telegram-conversations.service';

describe('TelegramConversationsService', () => {
  const queryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    addGroupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(),
  };
  const sessionQueryBuilder = {
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  };
  const conversations = {
    create: jest.fn((value) => value),
    save: jest.fn((value) => Promise.resolve({ id: 'message-1', ...value })),
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const services = { findOne: jest.fn(), find: jest.fn(), save: jest.fn() };
  const sessions = {
    find: jest.fn(),
    save: jest.fn(),
    query: jest.fn(),
    createQueryBuilder: jest.fn(() => sessionQueryBuilder),
  };
  const clients = { findOne: jest.fn() };
  const bot = { telegram: { sendMessage: jest.fn() } };
  const realtime = {
    emitToBoss: jest.fn(),
    emitToBosses: jest.fn(),
    emitToJefes: jest.fn(),
  };
  /*
   * Se construye por nombre y no con `new`.
   *
   * Con la lista posicional, cada dependencia nueva del servicio desplazaba todos
   * los dobles y estas pruebas fallaban por un motivo ajeno a lo que probaban.
   * Los campos inicializados de la clase entran como dobles porque
   * `Object.create` no los ejecuta.
   */
  const subject = Object.create(
    TelegramConversationsService.prototype,
  ) as TelegramConversationsService;
  Object.assign(subject, {
    conversationsRepository: conversations,
    servicesRepository: services,
    telegramSessionRepository: sessions,
    clientesRepository: clients,
    bot,
    realtimeEvents: realtime,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    queryBuilder.getRawMany.mockResolvedValue([]);
    sessionQueryBuilder.getMany.mockResolvedValue([]);
    conversations.find.mockResolvedValue([]);
    conversations.findOne.mockResolvedValue(null);
    conversations.update.mockResolvedValue({ affected: 0 });
    sessions.query.mockResolvedValue([]);
  });

  it.each([
    ['AI_ACTIVE without GPS is invalid', 'AI_ACTIVE', false, 'Hotel', false],
    [
      'manual text without confirmation is invalid',
      'HUMAN_ACTIVE',
      false,
      'Hotel',
      false,
    ],
    [
      'manual text with confirmation is valid',
      'HUMAN_ACTIVE',
      true,
      'Hotel',
      true,
    ],
    [
      'manual confirmation without text is invalid',
      'HUMAN_ACTIVE',
      true,
      '',
      false,
    ],
  ])('%s', (_label, mode, confirmed, locationName, expected) => {
    expect(
      (subject as any).isValidDraftLocation({
        mode,
        manualLocationConfirmed: confirmed,
        presetLocationId: null,
        locationName: locationName || null,
        locationAddress: null,
        locationLat: null,
        locationLng: null,
      }),
    ).toBe(expected);
  });

  it('keeps the GPS path valid for a normal booking', () => {
    expect(
      (subject as any).isValidDraftLocation({
        mode: 'AI_ACTIVE',
        manualLocationConfirmed: false,
        presetLocationId: null,
        locationName: null,
        locationAddress: null,
        locationLat: 20.5,
        locationLng: -100.4,
      }),
    ).toBe(true);
  });

  it('does not mark an AI booking READY without GPS', () => {
    expect(
      (subject as any).draftStatus({
        bookingStatus: 'READY',
        iaActiva: true,
        locationLat: null,
        locationLng: null,
      }),
    ).toBe('COLLECTING');
  });

  it('makes accepting an already-created draft idempotent', async () => {
    const mutableSubject = subject as any;
    const draft = {
      id: 'booking-1',
      clientId: 'client-1',
      intendedEmployeeId: 'employee-1',
      ownerBossId: 'boss-1',
      status: 'SERVICE_CREATED',
      mode: 'HUMAN_ACTIVE',
      serviceId: 'service-1',
      version: 4,
      metadata: {},
      updatedAt: new Date(),
      durationHours: 2,
      openEndedDuration: false,
      placeType: 'external',
      presetLocationId: null,
      locationName: 'Montecarlo',
      locationAddress: null,
      locationNotes: null,
      locationLat: 20.5,
      locationLng: -100.4,
      room: null,
      paymentMethod: 'efectivo',
      scheduleType: 'inmediato',
      scheduledAt: null,
      currentRequirement: null,
      lastInteractionAt: new Date(),
      createdAt: new Date(),
    } as any;
    mutableSubject.bookingDraftRepository = {
      findOne: jest.fn().mockResolvedValue(draft),
    } as any;
    mutableSubject.empleadasRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'employee-1',
        jefeId: 'boss-1',
        jefeSecundarioId: null,
      }),
    } as any;
    mutableSubject.servicesService = { reserveNext: jest.fn() } as any;

    const result = await subject.acceptBookingDraft('booking-1', {
      id: 'boss-1',
      rol: 'jefe',
    } as any);

    expect(result).toEqual({
      draft: expect.objectContaining({ serviceId: 'service-1' }),
      idempotent: true,
    });
    expect(mutableSubject.servicesService.reserveNext).not.toHaveBeenCalled();
    mutableSubject.bookingDraftRepository = undefined;
    mutableSubject.empleadasRepository = undefined;
    mutableSubject.servicesService = undefined;
  });

  it('creates one service and carries the boss note into the employee offer', async () => {
    const mutableSubject = subject as any;
    const draft = {
      id: 'booking-new',
      clientId: 'client-1',
      intendedEmployeeId: 'employee-1',
      ownerBossId: 'boss-1',
      status: 'READY',
      mode: 'HUMAN_ACTIVE',
      serviceId: null,
      version: 2,
      metadata: { bossNotes: 'Llegar por recepción' },
      updatedAt: new Date(),
      durationHours: 2,
      openEndedDuration: false,
      placeType: 'external',
      presetLocationId: null,
      locationName: 'Hotel',
      locationAddress: 'Calle 1',
      locationNotes: null,
      locationLat: 20.5,
      locationLng: -100.4,
      room: '302',
      paymentMethod: 'efectivo',
      scheduleType: 'inmediato',
      scheduledAt: null,
      currentRequirement: null,
      lastInteractionAt: new Date(),
      createdAt: new Date(),
    } as any;
    const savedDraft = {
      ...draft,
      serviceId: 'service-new',
      status: 'SERVICE_CREATED',
    };
    const offer = jest.fn().mockResolvedValue({ id: 'service-new' });
    const service = { id: 'service-new', bookingSessionId: 'booking-new' };
    mutableSubject.bookingDraftRepository = {
      findOne: jest.fn().mockResolvedValue(draft),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      })),
      save: jest.fn().mockResolvedValue(savedDraft),
      update: jest.fn(),
    } as any;
    mutableSubject.empleadasRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'employee-1',
        jefeId: 'boss-1',
        jefeSecundarioId: null,
        precioBaseHora: 1200,
      }),
    } as any;
    services.findOne.mockResolvedValue(null);
    conversations.findOne.mockResolvedValue({
      bookingSessionId: 'booking-new',
      servicioId: null,
      cliente: { telegramChatId: '123' },
      intendedEmployee: { jefeId: 'boss-1' },
    });
    mutableSubject.servicesService = {
      reserveNext: jest.fn().mockResolvedValue(service),
      ofrecerAEmpleada: offer,
    } as any;

    const result = await subject.acceptBookingDraft('booking-new', {
      id: 'boss-1',
      rol: 'jefe',
    } as any);

    expect(mutableSubject.servicesService.reserveNext).toHaveBeenCalledTimes(1);
    expect(offer).toHaveBeenCalledWith(
      'service-new',
      'boss-1',
      'chofer',
      'Llegar por recepción',
      '302',
    );
    expect(result).toEqual(
      expect.objectContaining({ idempotent: false, service }),
    );
  });

  it('accepts a manually confirmed textual location and persists NULL coordinates', async () => {
    const mutableSubject = subject as any;
    const draft = {
      id: 'booking-manual',
      clientId: 'client-1',
      intendedEmployeeId: 'employee-1',
      ownerBossId: 'boss-1',
      status: 'READY',
      mode: 'HUMAN_ACTIVE',
      manualLocationConfirmed: true,
      serviceId: null,
      version: 1,
      metadata: {},
      updatedAt: new Date(),
      durationHours: 1,
      openEndedDuration: false,
      placeType: 'external',
      presetLocationId: null,
      locationName: 'Hotel Centro',
      locationAddress: 'Calle 1 #2-3',
      locationNotes: null,
      locationLat: null,
      locationLng: null,
      room: null,
      paymentMethod: 'efectivo',
      scheduleType: 'inmediato',
      scheduledAt: null,
      currentRequirement: null,
      lastInteractionAt: new Date(),
      createdAt: new Date(),
    } as any;
    const service = {
      id: 'service-manual',
      bookingSessionId: 'booking-manual',
    };
    mutableSubject.bookingDraftRepository = {
      findOne: jest.fn().mockResolvedValue(draft),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      })),
      save: jest.fn().mockResolvedValue({ ...draft, serviceId: service.id }),
      update: jest.fn(),
    } as any;
    mutableSubject.empleadasRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'employee-1',
        jefeId: 'boss-1',
        jefeSecundarioId: null,
        precioBaseHora: 1200,
      }),
    } as any;
    services.findOne.mockResolvedValue(null);
    conversations.findOne.mockResolvedValue({
      bookingSessionId: draft.id,
      servicioId: null,
      cliente: { telegramChatId: '123' },
      intendedEmployee: { jefeId: 'boss-1' },
    });
    mutableSubject.servicesService = {
      reserveNext: jest.fn().mockResolvedValue(service),
      ofrecerAEmpleada: jest.fn().mockResolvedValue(undefined),
    } as any;

    await subject.acceptBookingDraft(draft.id, {
      id: 'boss-1',
      rol: 'jefe',
    } as any);

    expect(mutableSubject.servicesService.reserveNext).toHaveBeenCalledWith(
      expect.objectContaining({
        ubicacionClienteLat: null,
        ubicacionClienteLng: null,
        locationNameSnapshot: 'Hotel Centro',
        locationAddressSnapshot: 'Calle 1 #2-3',
      }),
    );
  });

  it('resolves /start to the latest open draft, never to a created service', async () => {
    const mutableSubject = subject as any;
    const findOne = jest.fn().mockResolvedValue({
      id: 'booking-open',
      clientId: 'client-1',
      status: 'READY',
    });
    mutableSubject.bookingDraftRepository = { findOne };

    const result = await subject.findActiveBookingDraftForClient('client-1');

    expect(result).toEqual(
      expect.objectContaining({ id: 'booking-open', status: 'READY' }),
    );
    expect(findOne).toHaveBeenCalledWith({
      where: {
        clientId: 'client-1',
        status: expect.anything(),
      },
      order: { updatedAt: 'DESC' },
    });
    mutableSubject.bookingDraftRepository = undefined;
  });

  it('envía, persiste y emite un mensaje del jefe asignado', async () => {
    services.findOne.mockResolvedValue({
      id: 'service-1',
      clienteId: 'client-1',
      clienteTelegramId: '123',
      jefeId: 'boss-1',
      iaActiva: false,
      empleada: {},
      jefe: { grupoTelegramId: '456' },
      telegramThreadId: '10',
    });

    const result = await subject.sendBossMessage(
      'service-1',
      { id: 'boss-1', rol: 'jefe' } as any,
      ' Buenas tardes ',
    );

    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
      '123',
      'Buenas tardes',
    );
    expect(conversations.save).toHaveBeenCalled();
    expect(realtime.emitToBosses).toHaveBeenCalledWith(
      ['boss-1', undefined, undefined],
      expect.objectContaining({ type: 'chat_message' }),
    );
    expect(result?.mensaje).toBe('Buenas tardes');
  });

  it('impide que otro jefe lea la conversación', async () => {
    services.findOne.mockResolvedValue({
      id: 'service-1',
      jefeId: 'boss-1',
      empleada: { jefeId: 'boss-1' },
    });

    await expect(
      subject.findByService(
        'service-1',
        { id: 'boss-2', rol: 'jefe' } as any,
        undefined,
        50,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  /*
   * Estas dos operaciones nuevas leen conversaciones sin servicio: no hay
   * jefe al que atribuirselas, asi que se reservan a admin en vez de
   * reutilizar la comprobacion por jefe del resto de la clase.
   */
  it('impide que un jefe liste conversaciones sin concretar', async () => {
    await expect(
      subject.listUnlinkedSessions({ id: 'boss-1', rol: 'jefe' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(conversations.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('lista las conversaciones sin concretar para un admin', async () => {
    queryBuilder.getRawMany.mockResolvedValue([
      {
        bookingSessionId: 'booking-1',
        clienteId: 'client-1',
        clienteNombre: 'Juan',
        clienteTelegramId: '999',
        startedAt: new Date('2026-08-29T10:00:00Z'),
        lastAt: new Date('2026-08-29T10:05:00Z'),
        messageCount: '4',
      },
    ]);

    const result = await subject.listUnlinkedSessions({
      id: 'admin-1',
      rol: 'admin',
    } as any);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith('c.servicioId IS NULL');
    expect(result).toEqual([
      expect.objectContaining({
        bookingSessionId: 'booking-1',
        clienteNombre: 'Juan',
        messageCount: 4,
      }),
    ]);
  });

  it('impide que otro jefe lea una conversación pre-servicio', async () => {
    conversations.findOne.mockResolvedValue({
      bookingSessionId: 'booking-1',
      cliente: { id: 'client-1' },
      intendedEmployee: {
        id: 'employee-1',
        jefeId: 'boss-owner',
        jefeSecundarioId: null,
      },
    });

    await expect(
      subject.findByBookingSession('booking-1', {
        id: 'boss-other',
        rol: 'jefe',
      } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(conversations.find).not.toHaveBeenCalled();
  });

  it('devuelve al jefe autorizado el historial pre-servicio completo', async () => {
    conversations.findOne.mockResolvedValue({
      bookingSessionId: 'booking-1',
      cliente: { id: 'client-1' },
      intendedEmployee: {
        id: 'employee-1',
        jefeId: 'boss-1',
        jefeSecundarioId: 'boss-2',
      },
    });
    conversations.find.mockResolvedValue([
      { id: 'm1', mensaje: 'hola' },
      { id: 'm2', mensaje: 'buenas' },
    ]);

    const result = await subject.findByBookingSession('booking-1', {
      id: 'boss-2',
      rol: 'jefe',
    } as any);

    expect(conversations.find).toHaveBeenCalledWith({
      where: { bookingSessionId: 'booking-1' },
      order: { enviadoAt: 'ASC' },
    });
    expect(result).toHaveLength(2);
  });

  it('lista resumen, modo y ficha operativa de cada chat', async () => {
    queryBuilder.getRawMany.mockResolvedValue([
      {
        clienteId: 'client-1',
        clienteNombre: 'Juan',
        clienteTelegramId: '999',
        lastAt: new Date('2026-10-05T12:00:00Z'),
        messageCount: '7',
        lastMessage: '¿A qué hora llega?',
        iaActiva: false,
        serviceId: 'service-1',
        serviceState: 'en_curso',
        employeeName: 'Valentina',
      },
    ]);

    const result = await subject.listRecentChats(
      { id: 'admin-1', rol: 'admin' } as any,
      50,
      'juan',
    );

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('nombre_telegram'),
      { search: '%juan%' },
    );
    expect(result[0]).toEqual(
      expect.objectContaining({
        lastMessage: '¿A qué hora llega?',
        mode: 'HUMAN_ACTIVE',
        serviceId: 'service-1',
        serviceState: 'en_curso',
        employeeName: 'Valentina',
      }),
    );
  });

  it('no permite responder si la IA sigue activa', async () => {
    clients.findOne.mockResolvedValue({
      id: 'client-1',
      telegramChatId: '999',
    });
    conversations.findOne.mockResolvedValue({ iaActiva: true });

    await expect(
      subject.sendAdminMessageByClient(
        'client-1',
        { id: 'admin-1', rol: 'admin' } as any,
        'Hola',
      ),
    ).rejects.toThrow('Toma el control');
    expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('mantiene HUMAN_ACTIVE al enviar la respuesta del jefe', async () => {
    clients.findOne.mockResolvedValue({
      id: 'client-1',
      telegramChatId: '999',
    });
    conversations.findOne.mockResolvedValue({
      clienteId: 'client-1',
      servicioId: 'service-1',
      bookingSessionId: 'booking-1',
      iaActiva: false,
    });

    await subject.sendAdminMessageByClient(
      'client-1',
      { id: 'admin-1', rol: 'admin' } as any,
      'Hola',
    );

    expect(conversations.save).toHaveBeenCalledWith(
      expect.objectContaining({
        servicioId: 'service-1',
        bookingSessionId: 'booking-1',
        iaActiva: false,
      }),
    );
  });

  it('aplica takeover a todas las sesiones Telegram del cliente', async () => {
    clients.findOne.mockResolvedValue({
      id: 'client-1',
      telegramChatId: '999',
    });
    services.find.mockResolvedValue([]);
    sessions.find.mockResolvedValue([
      { key: '999:999', data: {} },
      { key: 'employee:999:999', data: {} },
      { key: '888:888', data: {} },
    ]);

    await subject.toggleAiByClient(
      'client-1',
      { id: 'admin-1', rol: 'admin' } as any,
      false,
    );

    expect(sessions.save).toHaveBeenCalledTimes(2);
    expect(sessions.save).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          iaActiva: false,
          humanTakeover: true,
        }),
      }),
    );
  });

  it('lista el pre-servicio bajo la empleada para su jefe principal', async () => {
    queryBuilder.getRawMany.mockResolvedValue([
      {
        bookingSessionId: 'booking-1',
        lastAt: new Date('2026-10-06T10:01:00Z'),
      },
    ]);
    conversations.find.mockResolvedValue([
      {
        id: 'message-1',
        clienteId: 'client-1',
        bookingSessionId: 'booking-1',
        servicioId: null,
        emisor: 'cliente',
        mensaje: 'Hola, quiero información',
        iaActiva: true,
        enviadoAt: new Date('2026-10-06T10:01:00Z'),
        cliente: { nombreTelegram: 'Carlos', telegramChatId: '999' },
        intendedEmployee: {
          id: 'employee-1',
          nombreArtistico: 'Andrea',
          jefeId: 'boss-1',
          jefeSecundarioId: 'boss-2',
        },
      },
    ]);
    sessionQueryBuilder.getMany.mockResolvedValue([
      {
        updatedAt: new Date('2026-10-06T10:01:00Z'),
        data: {
          bookingSessionId: 'booking-1',
          bookingStatus: 'COLLECTING',
          duracionPactadaHoras: 2,
          metodoPago: 'efectivo',
        },
      },
    ]);

    const result = await subject.listPreServiceConversations({
      id: 'boss-1',
      rol: 'jefe',
    } as any);

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      '(employee.jefeId = :actorId OR employee.jefeSecundarioId = :actorId)',
      { actorId: 'boss-1' },
    );
    expect(result).toEqual([
      expect.objectContaining({
        bookingSessionId: 'booking-1',
        service: null,
        intendedEmployee: { id: 'employee-1', name: 'Andrea' },
        bookingData: expect.objectContaining({
          durationHours: 2,
          paymentMethod: 'efectivo',
        }),
      }),
    ]);
  });

  it.each(['COLLECTING', 'READY', 'HUMAN_ACTIVE', 'ACCEPTING'])(
    'muestra un draft pre-servicio en estado activo: %s',
    async (status) => {
      queryBuilder.getRawMany.mockResolvedValue([
        { bookingSessionId: 'booking-active', lastAt: new Date() },
      ]);
      conversations.find.mockResolvedValue([
        {
          id: 'message-active',
          clienteId: 'client-1',
          bookingSessionId: 'booking-active',
          servicioId: null,
          emisor: 'cliente',
          mensaje: 'Solicitud activa',
          iaActiva: status !== 'HUMAN_ACTIVE',
          enviadoAt: new Date(),
          cliente: { nombreTelegram: 'Carlos', telegramChatId: '999' },
          intendedEmployee: {
            id: 'employee-1',
            nombreArtistico: 'Andrea',
            jefeId: 'boss-1',
          },
        },
      ]);
      sessionQueryBuilder.getMany.mockResolvedValue([]);
      (subject as any).bookingDraftRepository = {
        findBy: jest.fn().mockResolvedValue([
          {
            id: 'booking-active',
            status,
            mode: status === 'HUMAN_ACTIVE' ? 'HUMAN_ACTIVE' : 'AI_ACTIVE',
            durationHours: 2,
            openEndedDuration: false,
            paymentMethod: 'efectivo',
            locationLat: 20,
            locationLng: -100,
            updatedAt: new Date(),
            version: 1,
          },
        ]),
      };

      const result = await subject.listPreServiceConversations({
        id: 'boss-1',
        rol: 'jefe',
      } as any);

      expect(result).toHaveLength(1);
      (subject as any).bookingDraftRepository = undefined;
    },
  );

  it.each(['SERVICE_CREATED', 'CANCELLED', 'ABANDONED'])(
    'no muestra un draft terminal aunque su conversación tenga servicio_id nulo: %s',
    async (status) => {
      queryBuilder.getRawMany.mockResolvedValue([
        { bookingSessionId: 'booking-terminal', lastAt: new Date() },
      ]);
      conversations.find.mockResolvedValue([
        {
          id: 'message-terminal',
          clienteId: 'client-1',
          bookingSessionId: 'booking-terminal',
          servicioId: null,
          emisor: 'cliente',
          mensaje: 'Historial',
          iaActiva: true,
          enviadoAt: new Date(),
          cliente: { nombreTelegram: 'Carlos', telegramChatId: '999' },
          intendedEmployee: {
            id: 'employee-1',
            nombreArtistico: 'Andrea',
            jefeId: 'boss-1',
          },
        },
      ]);
      sessionQueryBuilder.getMany.mockResolvedValue([]);
      (subject as any).bookingDraftRepository = {
        findBy: jest
          .fn()
          .mockResolvedValue([{ id: 'booking-terminal', status }]),
      };

      const result = await subject.listPreServiceConversations({
        id: 'boss-1',
        rol: 'jefe',
      } as any);

      expect(result).toEqual([]);
      (subject as any).bookingDraftRepository = undefined;
    },
  );

  it('usa fallback legacy solo con sesión activa y no con historial huérfano', async () => {
    queryBuilder.getRawMany.mockResolvedValue([
      { bookingSessionId: 'legacy-active', lastAt: new Date() },
      { bookingSessionId: 'legacy-orphan', lastAt: new Date() },
    ]);
    conversations.find.mockResolvedValue([
      {
        id: 'message-active',
        clienteId: 'client-1',
        bookingSessionId: 'legacy-active',
        servicioId: null,
        emisor: 'cliente',
        mensaje: 'Legacy activo',
        iaActiva: true,
        enviadoAt: new Date(),
        cliente: { nombreTelegram: 'Carlos', telegramChatId: '999' },
        intendedEmployee: {
          id: 'employee-1',
          nombreArtistico: 'Andrea',
          jefeId: 'boss-1',
        },
      },
      {
        id: 'message-orphan',
        clienteId: 'client-1',
        bookingSessionId: 'legacy-orphan',
        servicioId: null,
        emisor: 'cliente',
        mensaje: 'Historial huérfano',
        iaActiva: true,
        enviadoAt: new Date(),
        cliente: { nombreTelegram: 'Carlos', telegramChatId: '999' },
        intendedEmployee: {
          id: 'employee-1',
          nombreArtistico: 'Andrea',
          jefeId: 'boss-1',
        },
      },
    ]);
    sessionQueryBuilder.getMany.mockResolvedValue([
      {
        updatedAt: new Date(),
        data: {
          bookingSessionId: 'legacy-active',
          bookingStatus: 'COLLECTING',
          step: 'AWAITING_LOCATION',
        },
      },
      {
        updatedAt: new Date(),
        data: {
          bookingSessionId: 'legacy-orphan',
          bookingStatus: 'SERVICE_CREATED',
          bookingServiceId: 'service-old',
        },
      },
    ]);
    (subject as any).bookingDraftRepository = {
      findBy: jest.fn().mockResolvedValue([]),
    };

    const result = await subject.listPreServiceConversations({
      id: 'boss-1',
      rol: 'jefe',
    } as any);

    expect(result.map((item) => item.bookingSessionId)).toEqual([
      'legacy-active',
    ]);
    (subject as any).bookingDraftRepository = undefined;
  });

  it('aplica takeover pre-servicio, sincroniza la sesión y emite solo al equipo', async () => {
    conversations.findOne.mockResolvedValue({
      clienteId: 'client-1',
      intendedEmployeeId: 'employee-1',
      cliente: { id: 'client-1', telegramChatId: '999' },
      intendedEmployee: {
        id: 'employee-1',
        jefeId: 'boss-1',
        jefeSecundarioId: 'boss-2',
      },
    });
    sessions.query.mockResolvedValue([{ key: '999:999' }]);

    await subject.toggleAiByBookingSession(
      'booking-1',
      { id: 'boss-1', rol: 'jefe' } as any,
      false,
    );

    expect(sessions.query).toHaveBeenCalledWith(
      expect.stringContaining("data->>'bookingSessionId' = $1"),
      ['booking-1', false, true],
    );
    expect(conversations.update).toHaveBeenCalledWith(
      { bookingSessionId: 'booking-1' },
      { iaActiva: false },
    );
    expect(realtime.emitToBosses).toHaveBeenCalledWith(
      ['boss-1', 'boss-2'],
      expect.objectContaining({ type: 'conversation_mode_changed' }),
    );
    expect(realtime.emitToJefes).not.toHaveBeenCalled();
  });

  it('permite responder en pre-servicio solo tras el takeover', async () => {
    conversations.findOne.mockResolvedValue({
      clienteId: 'client-1',
      intendedEmployeeId: 'employee-1',
      iaActiva: false,
      cliente: { id: 'client-1', telegramChatId: '999' },
      intendedEmployee: {
        id: 'employee-1',
        jefeId: 'boss-1',
        jefeSecundarioId: null,
      },
    });

    const result = await subject.sendAdminMessageToSession(
      'booking-1',
      { id: 'boss-1', rol: 'jefe' } as any,
      ' Buenas tardes ',
    );

    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
      '999',
      'Buenas tardes',
    );
    expect(conversations.save).toHaveBeenCalledWith(
      expect.objectContaining({
        bookingSessionId: 'booking-1',
        intendedEmployeeId: 'employee-1',
        iaActiva: false,
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ mensaje: 'Buenas tardes', iaActiva: false }),
    );
  });

  it('devuelve el pre-servicio a la IA sin abrir acceso global', async () => {
    conversations.findOne.mockResolvedValue({
      clienteId: 'client-1',
      intendedEmployeeId: 'employee-1',
      cliente: { id: 'client-1', telegramChatId: '999' },
      intendedEmployee: {
        id: 'employee-1',
        jefeId: 'boss-1',
        jefeSecundarioId: null,
      },
    });
    sessions.query.mockResolvedValue([{ key: '999:999' }]);

    await subject.toggleAiByBookingSession(
      'booking-1',
      { id: 'boss-1', rol: 'jefe' } as any,
      true,
    );

    expect(sessions.query).toHaveBeenCalledWith(expect.any(String), [
      'booking-1',
      true,
      false,
    ]);
    expect(realtime.emitToJefes).not.toHaveBeenCalled();
  });

  it('reserva los monitores globales de clientes para admin', async () => {
    await expect(
      subject.listRecentChats({ id: 'boss-1', rol: 'jefe' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      subject.toggleAiByClient(
        'client-1',
        { id: 'boss-1', rol: 'jefe' } as any,
        false,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
