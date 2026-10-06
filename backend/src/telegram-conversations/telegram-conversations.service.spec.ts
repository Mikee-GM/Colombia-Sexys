import { ConflictException } from '@nestjs/common';
import { TelegramConversationsService } from './telegram-conversations.service';

describe('TelegramConversationsService', () => {
  const queryBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
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
  const conversations = {
    create: jest.fn((value) => value),
    save: jest.fn((value) => Promise.resolve({ id: 'message-1', ...value })),
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const services = { findOne: jest.fn(), find: jest.fn(), save: jest.fn() };
  const sessions = { find: jest.fn(), save: jest.fn() };
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

  beforeEach(() => jest.clearAllMocks());

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

  it('impide que un jefe lea una conversación sin concretar', async () => {
    await expect(
      subject.findByBookingSession('booking-1', {
        id: 'boss-1',
        rol: 'jefe',
      } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('devuelve el historial completo de una conversación sin concretar', async () => {
    conversations.find.mockResolvedValue([
      { id: 'm1', mensaje: 'hola' },
      { id: 'm2', mensaje: 'buenas' },
    ]);

    const result = await subject.findByBookingSession('booking-1', {
      id: 'admin-1',
      rol: 'admin',
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
        { id: 'boss-1', rol: 'jefe' } as any,
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
      { id: 'boss-1', rol: 'jefe' } as any,
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
      { id: 'boss-1', rol: 'jefe' } as any,
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
});
