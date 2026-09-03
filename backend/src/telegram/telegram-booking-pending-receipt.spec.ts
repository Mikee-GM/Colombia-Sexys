import { TelegramBookingUpdate } from './telegram-booking.update';

/**
 * La reserva por transferencia tiene que existir aunque el cliente no haya
 * pagado todavia.
 *
 * Antes `finalizeBooking` --el unico sitio que da de alta el servicio y avisa
 * al jefe-- se llamaba DESPUES de validar la foto del comprobante. Como el
 * cliente habitual contesta "cuando llegues transfiero", la reserva se quedaba
 * con los tres datos cerrados y sin existir: ni el jefe se enteraba, ni nadie
 * podia despacharla, ni quedaba constancia de que se hubiera perdido. El cobro
 * pasa a ser una condicion para DESPACHAR, no para existir.
 */
describe('TelegramBookingUpdate.cerrarReservaEsperandoComprobante', () => {
  let update: any;
  let ctx: any;

  const sesionCompleta = () => ({
    step: 'AWAITING_PAYMENT_RECEIPT',
    empleadaId: 'emp-1',
    duracionPactadaHoras: 1,
    metodoPago: 'transferencia',
    locationLat: '20.540046',
    locationLng: '-100.433409',
    locationNotas: 'Lugar seleccionado: Majestic',
    bookingSessionId: 'draft-1',
  });

  beforeEach(() => {
    update = Object.create(TelegramBookingUpdate.prototype);
    update.clientesRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'cli-1' }),
    };
    update.empleadasRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'emp-1' }),
    };
    update.finalizeBooking = jest
      .fn()
      .mockResolvedValue({ id: 'srv-1' } as any);
    ctx = { from: { id: 55 }, session: sesionCompleta() };
  });

  it('da de alta el servicio marcando que falta el comprobante', async () => {
    await update.cerrarReservaEsperandoComprobante(ctx);

    expect(update.finalizeBooking).toHaveBeenCalledTimes(1);
    const args = update.finalizeBooking.mock.calls[0];
    expect(args[4]).toBe('transferencia');
    expect(args[args.length - 1]).toEqual({ esperaComprobante: true });
    expect(ctx.session.servicioPendienteComprobanteId).toBe('srv-1');
  });

  /** Si no, cada mensaje del cliente abriria otro servicio para lo mismo. */
  it('no crea una segunda reserva si ya se cerro una', async () => {
    ctx.session.servicioPendienteComprobanteId = 'srv-1';

    await update.cerrarReservaEsperandoComprobante(ctx);

    expect(update.finalizeBooking).not.toHaveBeenCalled();
  });

  it('no cierra nada mientras falte alguno de los tres datos', async () => {
    ctx.session.duracionPactadaHoras = undefined;

    await update.cerrarReservaEsperandoComprobante(ctx);

    expect(update.finalizeBooking).not.toHaveBeenCalled();
    expect(ctx.session.servicioPendienteComprobanteId).toBeUndefined();
  });

  it('acepta la duracion indefinida como duracion valida', async () => {
    ctx.session.duracionPactadaHoras = undefined;
    ctx.session.duracionIndefinida = true;

    await update.cerrarReservaEsperandoComprobante(ctx);

    expect(update.finalizeBooking).toHaveBeenCalledTimes(1);
  });
});

/**
 * Elegir transferencia cierra la reserva y ADEMAS pide el comprobante. Antes
 * solo pedia el comprobante, y ahi moria todo si el cliente no volvia.
 */
describe('TelegramBookingUpdate.applyDraftPaymentMethod con transferencia', () => {
  let update: any;
  let ctx: any;

  beforeEach(() => {
    update = Object.create(TelegramBookingUpdate.prototype);
    update.aprovecharComprobanteAdelantado = jest
      .fn()
      .mockResolvedValue(false);
    update.cerrarReservaEsperandoComprobante = jest
      .fn()
      .mockResolvedValue(undefined);
    update.registrarMensajeDelFlujo = jest.fn().mockResolvedValue(undefined);
    update.servicesService = {
      bankTransferDetails: jest.fn().mockResolvedValue('CLABE 0000'),
    };
    ctx = {
      from: { id: 55 },
      reply: jest.fn().mockResolvedValue(undefined),
      session: {
        empleadaId: 'emp-1',
        duracionPactadaHoras: 1,
        locationLat: '20.5',
        locationLng: '-100.4',
      },
    };
  });

  it('cierra la reserva antes de pedirle la foto al cliente', async () => {
    const resultado = await update.applyDraftPaymentMethod(
      ctx,
      'transferencia',
    );

    expect(resultado).toBe(true);
    expect(update.cerrarReservaEsperandoComprobante).toHaveBeenCalledWith(ctx);
    expect(ctx.session.step).toBe('AWAITING_PAYMENT_RECEIPT');
    expect(ctx.reply).toHaveBeenCalled();
  });

  /*
   * Las cuentas bancarias y la peticion del comprobante salian por `ctx.reply`
   * sin registrarse, asi que en el panel la conversacion parecia cortarse justo
   * donde el bot habia seguido hablando: quien revisaba por que se cayo una
   * reserva estaba mirando una version incompleta.
   */
  it('deja la peticion del comprobante en el historial', async () => {
    await update.applyDraftPaymentMethod(ctx, 'transferencia');

    expect(update.registrarMensajeDelFlujo).toHaveBeenCalledWith(
      ctx,
      expect.stringContaining('comprobante'),
    );
  });

  it('con un comprobante ya adelantado no duplica el cierre', async () => {
    update.aprovecharComprobanteAdelantado.mockResolvedValue(true);

    await update.applyDraftPaymentMethod(ctx, 'transferencia');

    expect(update.cerrarReservaEsperandoComprobante).not.toHaveBeenCalled();
  });
});

/**
 * Cambiar de metodo con la reserva ya cerrada.
 *
 * En el paso del comprobante el bot ofrece "cambiar a efectivo", y el cliente
 * tambien puede escribirlo. Antes ahi no existia servicio y crear uno era lo
 * correcto; ahora ya existe, asi que seguir de largo lo duplicaria y dejaria a
 * la empleada apartada dos veces para la misma cita.
 */
describe('TelegramBookingUpdate.applyDraftPaymentMethod con reserva ya cerrada', () => {
  let update: any;
  let ctx: any;

  beforeEach(() => {
    update = Object.create(TelegramBookingUpdate.prototype);
    update.finalizeBooking = jest.fn();
    update.registrarMensajeDelFlujo = jest.fn().mockResolvedValue(undefined);
    update.serviciosRepository = {
      update: jest.fn().mockResolvedValue(undefined),
    };
    update.servicesService = {
      changePaymentMethodByClient: jest.fn().mockResolvedValue({}),
      bankTransferDetails: jest.fn().mockResolvedValue('CLABE 0000'),
    };
    update.logger = { warn: jest.fn(), error: jest.fn() };
    ctx = {
      from: { id: 55 },
      reply: jest.fn().mockResolvedValue(undefined),
      session: {
        step: 'AWAITING_PAYMENT_RECEIPT',
        empleadaId: 'emp-1',
        duracionPactadaHoras: 1,
        metodoPago: 'transferencia',
        locationLat: '20.5',
        locationLng: '-100.4',
        servicioPendienteComprobanteId: 'srv-1',
      },
    };
  });

  it('cambia el servicio existente en vez de crear otro', async () => {
    const resultado = await update.applyDraftPaymentMethod(ctx, 'efectivo');

    expect(resultado).toBe(true);
    expect(update.finalizeBooking).not.toHaveBeenCalled();
    expect(
      update.servicesService.changePaymentMethodByClient,
    ).toHaveBeenCalledWith('srv-1', '55', 'efectivo');
  });

  it('al pasar a efectivo deja de esperar comprobante', async () => {
    await update.applyDraftPaymentMethod(ctx, 'efectivo');

    expect(update.serviciosRepository.update).toHaveBeenCalledWith('srv-1', {
      comprobantePendiente: false,
    });
    expect(ctx.session.servicioPendienteComprobanteId).toBeUndefined();
  });

  it('al seguir en transferencia mantiene la espera del comprobante', async () => {
    await update.applyDraftPaymentMethod(ctx, 'transferencia');

    expect(update.finalizeBooking).not.toHaveBeenCalled();
    expect(ctx.session.step).toBe('AWAITING_PAYMENT_RECEIPT');
    expect(ctx.session.servicioPendienteComprobanteId).toBe('srv-1');
  });
});

/**
 * Cuando la foto llega, se engancha al servicio que ya existe. Crear otro
 * dejaria al cliente con dos reservas y a la empleada doblemente apartada.
 */
describe('TelegramBookingUpdate.registrarComprobanteEnServicio', () => {
  let update: any;
  let servicio: any;

  beforeEach(() => {
    servicio = {
      id: 'srv-1',
      estado: 'pendiente',
      jefeId: 'jefe-1',
      comprobantePendiente: true,
      telegramThreadId: '77',
      empleada: { id: 'emp-1' },
      cliente: { nombreTelegram: 'Ana' },
    };
    update = Object.create(TelegramBookingUpdate.prototype);
    update.serviciosRepository = {
      findOne: jest.fn().mockResolvedValue(servicio),
      save: jest.fn().mockResolvedValue(servicio),
    };
    update.paymentReceiptValidationsRepository = {
      update: jest.fn().mockResolvedValue(undefined),
    };
    update.realtimeEventsService = { emitToBoss: jest.fn() };
    update.findAssignedJefe = jest
      .fn()
      .mockResolvedValue({ grupoTelegramId: '-100' });
    update.bot = {
      telegram: { sendMessage: jest.fn().mockResolvedValue(undefined) },
    };
    update.logger = { warn: jest.fn(), error: jest.fn() };
  });

  it('levanta la marca de pago pendiente y enlaza la validacion', async () => {
    await expect(
      update.registrarComprobanteEnServicio('srv-1', 'val-1'),
    ).resolves.toBe(true);

    expect(servicio.comprobantePendiente).toBe(false);
    expect(update.serviciosRepository.save).toHaveBeenCalledWith(servicio);
    expect(update.paymentReceiptValidationsRepository.update).toHaveBeenCalledWith(
      'val-1',
      { servicioId: 'srv-1' },
    );
  });

  it('avisa al jefe en el hilo del servicio', async () => {
    await update.registrarComprobanteEnServicio('srv-1', 'val-1');

    expect(update.bot.telegram.sendMessage).toHaveBeenCalledWith(
      '-100',
      expect.stringContaining('Pago recibido'),
      { message_thread_id: 77 },
    );
  });

  it('no toca un servicio ya cancelado', async () => {
    servicio.estado = 'cancelado';

    await expect(
      update.registrarComprobanteEnServicio('srv-1', 'val-1'),
    ).resolves.toBe(false);
    expect(update.serviciosRepository.save).not.toHaveBeenCalled();
  });

  it('no falla si el servicio ya no existe', async () => {
    update.serviciosRepository.findOne.mockResolvedValue(null);

    await expect(
      update.registrarComprobanteEnServicio('srv-1', 'val-1'),
    ).resolves.toBe(false);
  });
});
