import { TelegramBookingUpdate } from './telegram-booking.update';

describe('TelegramBookingUpdate global booking router', () => {
  function setup() {
    const update = Object.create(TelegramBookingUpdate.prototype);
    const ctx: any = {
      chat: { type: 'private' },
      from: { id: 77 },
      session: {
        bookingSessionId: 'booking-a',
        bookingStatus: 'COLLECTING',
        empleadaId: 'employee-a',
        step: 'AWAITING_LOCATION',
      },
      reply: jest.fn().mockResolvedValue(undefined),
    };
    update.empleadasRepository = {
      find: jest.fn().mockResolvedValue([
        { id: 'employee-a', nombreArtistico: 'Andrea', catalogoActivo: true },
        { id: 'employee-b', nombreArtistico: 'Paula', catalogoActivo: true },
      ]),
      findOne: jest.fn().mockResolvedValue({
        id: 'employee-b',
        nombreArtistico: 'Paula',
        catalogoActivo: true,
      }),
    };
    update.startHireSession = jest.fn().mockResolvedValue(undefined);
    update.recordDraftConversation = jest.fn().mockResolvedValue(undefined);
    update.persistSession = jest.fn().mockResolvedValue(undefined);
    update.showAvailableEmployeeCatalog = jest
      .fn()
      .mockResolvedValue(undefined);
    update.entregarConversacionAlJefe = jest.fn().mockResolvedValue(undefined);
    update.hasConfirmedLocation = jest.fn().mockReturnValue(false);
    return { update, ctx };
  }

  it('interrumpe una pregunta de ubicación cuando el cliente cambia de empleada', async () => {
    const { update, ctx } = setup();

    const handled = await update.routeGlobalBookingIntent(
      ctx,
      'mejor quiero a Paula',
      { id: 'employee-a', nombreArtistico: 'Andrea' },
    );

    expect(handled).toBe(true);
    expect(update.startHireSession).toHaveBeenCalledWith(ctx, 'employee-b');
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('cancela solo el draft y conserva su bookingSessionId para el historial', async () => {
    const { update, ctx } = setup();

    const handled = await update.routeGlobalBookingIntent(
      ctx,
      'cancelar solicitud',
      { id: 'employee-a', nombreArtistico: 'Andrea' },
    );

    expect(handled).toBe(true);
    expect(ctx.session.bookingStatus).toBe('CANCELLED');
    expect(ctx.session.bookingSessionId).toBe('booking-a');
    expect(update.recordDraftConversation).toHaveBeenCalledWith(
      ctx,
      'sistema',
      expect.stringContaining('cancelada'),
    );
  });

  it('entrega el chat después de tres mensajes desconocidos en el mismo paso', async () => {
    const { update, ctx } = setup();

    await update.routeGlobalBookingIntent(ctx, 'mensaje sin sentido uno', {
      id: 'employee-a',
      nombreArtistico: 'Andrea',
    });
    await update.routeGlobalBookingIntent(ctx, 'mensaje sin sentido dos', {
      id: 'employee-a',
      nombreArtistico: 'Andrea',
    });
    await update.routeGlobalBookingIntent(ctx, 'mensaje sin sentido tres', {
      id: 'employee-a',
      nombreArtistico: 'Andrea',
    });

    expect(update.entregarConversacionAlJefe).toHaveBeenCalledTimes(1);
    expect(ctx.session.bookingFailureCount).toBe(0);
  });

  it('mantiene HUMAN_ACTIVE y no responde al abrir un nuevo deep-link', async () => {
    const update = Object.create(TelegramBookingUpdate.prototype);
    const ctx: any = {
      from: { id: 77 },
      session: {
        bookingSessionId: 'booking-old',
        bookingStatus: 'SERVICE_CREATED',
        humanTakeover: true,
        iaActiva: false,
      },
      reply: jest.fn().mockResolvedValue(undefined),
    };
    const employee = {
      id: 'employee-b',
      nombreArtistico: 'Paula',
      catalogoActivo: true,
      disponible: true,
      usuario: { enJornada: true },
    };
    update.empleadasRepository = {
      findOne: jest.fn().mockResolvedValue(employee),
    };
    update.serviciosRepository = { findOne: jest.fn().mockResolvedValue(null) };
    update.persistSession = jest.fn().mockResolvedValue(undefined);

    const previousToken = process.env.XAI_API_KEY;
    process.env.XAI_API_KEY = 'test-only';
    try {
      await update.startHireSession(ctx, employee.id);
    } finally {
      if (previousToken === undefined) delete process.env.XAI_API_KEY;
      else process.env.XAI_API_KEY = previousToken;
    }

    expect(ctx.session.bookingSessionId).not.toBe('booking-old');
    expect(ctx.session.humanTakeover).toBe(true);
    expect(ctx.session.iaActiva).toBe(false);
    expect(ctx.reply).not.toHaveBeenCalled();
    expect(update.persistSession).toHaveBeenCalled();
  });
});
