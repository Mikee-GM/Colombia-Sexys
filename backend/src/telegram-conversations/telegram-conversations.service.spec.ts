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
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
  const services = { findOne: jest.fn() };
  const bot = { telegram: { sendMessage: jest.fn() } };
  const realtime = { emitToBoss: jest.fn(), emitToBosses: jest.fn() };
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
});
