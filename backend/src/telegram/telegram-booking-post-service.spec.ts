import {
  shouldResetClosedBookingOnMessage,
  TelegramBookingUpdate,
} from './telegram-booking.update';

describe('TelegramBookingUpdate post-service callbacks', () => {
  it('abre contexto nuevo solo ante un mensaje real posterior al cierre', () => {
    expect(
      shouldResetClosedBookingOnMessage('private', 'SERVICE_CREATED'),
    ).toBe(true);
    expect(shouldResetClosedBookingOnMessage('private', 'COLLECTING')).toBe(
      false,
    );
    expect(
      shouldResetClosedBookingOnMessage('supergroup', 'SERVICE_CREATED'),
    ).toBe(false);
  });

  function subject() {
    const update = Object.create(
      TelegramBookingUpdate.prototype,
    ) as TelegramBookingUpdate;
    const serviceRow = {
      id: 'service-1',
      estado: 'finalizado',
      empleadaId: 'employee-1',
      calificacion: null,
      cliente: { telegramChatId: '7001' },
    };
    const services = {
      findOne: jest.fn().mockResolvedValue(serviceRow),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const clients = {
      findOne: jest.fn().mockResolvedValue({ id: 'client-1' }),
    };
    const discipline = {
      createClientRatingIdempotent: jest.fn().mockResolvedValue({
        rating: { id: 'rating-1', stars: 3 },
        created: true,
      }),
      addClientRatingReason: jest.fn().mockResolvedValue({}),
    };
    Object.assign(update as any, {
      serviciosRepository: services,
      clientesRepository: clients,
      disciplineService: discipline,
    });
    return { update, services, discipline };
  }

  it('guarda 3 estrellas sin activar una conversación ni pedir otro mensaje', async () => {
    const { update, discipline } = subject();
    const session = {
      bookingStatus: 'SERVICE_CREATED',
      bookingSessionId: 'old-booking',
    };
    const ctx: any = {
      session,
      from: { id: 7001 },
      match: ['calificar_servicio:service-1:3', 'service-1', '3'],
      answerCbQuery: jest.fn(),
      editMessageText: jest.fn(),
      reply: jest.fn(),
    };

    await update.onCalificarServicio(ctx);

    expect(discipline.createClientRatingIdempotent).toHaveBeenCalledTimes(1);
    expect(ctx.session).toBe(session);
    expect(ctx.reply).not.toHaveBeenCalled();
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('Si quieres, puedes indicar el motivo'),
      expect.not.objectContaining({ parse_mode: expect.anything() }),
    );
  });

  it('recontrata con una bookingSession limpia y solo conserva la empleada', async () => {
    const { update } = subject();
    const startHireSession = jest.fn().mockImplementation((ctx) => {
      ctx.session.bookingSessionId = 'new-booking';
      return Promise.resolve();
    });
    (update as any).startHireSession = startHireSession;
    const ctx: any = {
      session: {
        bookingSessionId: 'old-booking',
        duracionPactadaHoras: 5,
        locationAddressSnapshot: 'Dato anterior',
      },
      from: { id: 7001 },
      match: ['rehire_service:service-1', 'service-1'],
      answerCbQuery: jest.fn(),
      reply: jest.fn(),
    };

    await update.onRehireService(ctx);

    expect(startHireSession).toHaveBeenCalledWith(ctx, 'employee-1');
    expect(ctx.session).toEqual({ bookingSessionId: 'new-booking' });
  });

  it('abre el catálogo sin reutilizar la sesión terminada', async () => {
    const { update } = subject();
    const showAvailableEmployeeCatalog = jest.fn().mockResolvedValue(undefined);
    (update as any).showAvailableEmployeeCatalog = showAvailableEmployeeCatalog;
    const ctx: any = {
      session: {
        bookingSessionId: 'old-booking',
        bookingStatus: 'SERVICE_CREATED',
        duracionPactadaHoras: 2,
      },
      answerCbQuery: jest.fn(),
    };

    await update.onPostServiceCatalog(ctx);

    expect(ctx.session).toEqual({});
    expect(showAvailableEmployeeCatalog).toHaveBeenCalledWith(ctx);
  });
});
