import {
  TelegramBookingUpdate,
  shouldChangeExistingServicePayment,
} from './telegram-booking.update';

describe('TelegramBookingUpdate global booking router', () => {
  it('keeps the existing service payment unchanged while a new booking is active', () => {
    expect(
      shouldChangeExistingServicePayment(
        'quiero 2 horas montecarlo en efectivo',
        {
          bookingSessionId: 'booking-b',
          bookingStatus: 'COLLECTING',
        },
      ),
    ).toBe(false);
    expect(
      shouldChangeExistingServicePayment(
        'quiero cambiar el metodo de pago del servicio actual a efectivo',
        undefined,
      ),
    ).toBe(true);
  });

  it.each([
    'quiero 2 horas montecarlo en efectivo',
    'dos horas en efectivo',
    'reserva una hora y pago con tarjeta',
    'quiero una hora en transferencia',
    'montecarlo 3 horas efectivo',
    '2h en efectivo por favor',
    'quiero contratar y pagar en tarjeta',
    'agendame dos horas transferencia',
    'una horita y efectivo',
    'quiero 4 horas y pagar tarjeta',
    'para 2 horas efectivo',
    'contrato tres horas en transferencia',
    'quiero el servicio por una hora',
    'dos horas, lugar montecarlo, efectivo',
    'reserva 5 horas con tarjeta',
    'necesito una hora y transferencia',
    'quiero contratar 6 horas efectivo',
    'una hora en montecarlo y pago en tarjeta',
    'separa 2 horas para hoy en efectivo',
    'quiero servicio de 3 horas transferencia',
  ])(
    'does not reinterpret booking text as a historical payment change: %s',
    (text) => {
      expect(
        shouldChangeExistingServicePayment(text, {
          bookingSessionId: 'booking-b',
          bookingStatus: 'COLLECTING',
        }),
      ).toBe(false);
    },
  );

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

  it('does not mutate Service A when Booking B includes a payment word', async () => {
    const update: any = Object.create(TelegramBookingUpdate.prototype);
    const changePaymentMethodByClient = jest.fn();
    update.manualServiceWizard = {
      manejarTexto: jest.fn().mockResolvedValue(false),
    };
    update.teamChannelUpdate = {
      manejarTexto: jest.fn().mockResolvedValue(false),
    };
    update.clienteBloqueado = jest.fn().mockResolvedValue(false);
    update.usuariosRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    update.groupServicesService = {
      findActiveRequestByClientTelegram: jest.fn().mockResolvedValue(null),
    };
    update.clientesRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'client-1',
        telegramChatId: '77',
      }),
    };
    update.serviciosRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'service-a',
        clienteTelegramId: '77',
        estado: 'pendiente',
        metodoPago: 'tarjeta',
        iaActiva: false,
        telegramThreadId: '1',
        jefe: { id: 'boss-1', grupoTelegramId: 'group-1' },
        cliente: { nombreTelegram: 'Cliente' },
        empleada: { nombreArtistico: 'Andrea', jefe: null },
      }),
      save: jest.fn(),
    };
    update.servicesService = { changePaymentMethodByClient };
    update.recordConversation = jest.fn().mockResolvedValue(undefined);
    update.configService = { get: jest.fn().mockReturnValue(undefined) };
    update.bot = {
      telegram: { sendMessage: jest.fn().mockResolvedValue(undefined) },
    };
    update.logger = { log: jest.fn(), error: jest.fn(), warn: jest.fn() };

    await update.onMessage(
      {
        chat: { type: 'private', id: 77 },
        from: { id: 77, first_name: 'Cliente' },
        message: { text: 'quiero 2 horas montecarlo en efectivo' },
        session: {
          bookingSessionId: 'booking-b',
          bookingStatus: 'COLLECTING',
          empleadaId: 'employee-b',
          step: 'AWAITING_DURATION',
        },
      },
      jest.fn(),
    );

    expect(changePaymentMethodByClient).not.toHaveBeenCalled();
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
