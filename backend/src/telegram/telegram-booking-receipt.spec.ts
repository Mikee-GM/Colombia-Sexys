import { TelegramBookingUpdate } from './telegram-booking.update';

/**
 * El monto que se le exige al comprobante de una reserva.
 *
 * Se calculaba a mano con la tarifa base de la modelo y sin el transporte, asi
 * que en un trio se aprobaba la mitad de lo cotizado y con ubicacion externa se
 * colaba sin el cargo que el bot acababa de sumarle al cliente.
 */
describe('TelegramBookingUpdate.montoEsperadoDeTransferencia', () => {
  const update: any = Object.create(TelegramBookingUpdate.prototype);
  const empleada = { precioBaseHora: 1200 } as any;

  it('suma las horas por la tarifa de la modelo', () => {
    const monto = update.montoEsperadoDeTransferencia(
      { duracionPactadaHoras: 2 },
      empleada,
    );
    expect(monto).toBe(2400);
  });

  it('incluye el cargo de transporte que se le cotizo al cliente', () => {
    const monto = update.montoEsperadoDeTransferencia(
      { duracionPactadaHoras: 2, customerTransportCharge: 350 },
      empleada,
    );
    expect(monto).toBe(2750);
  });

  it('usa la tarifa combinada cuando el trio esta confirmado', () => {
    const monto = update.montoEsperadoDeTransferencia(
      {
        duracionPactadaHoras: 2,
        trioStatus: 'confirmed',
        trioCombinedRatePerHour: 2000,
      },
      empleada,
    );
    expect(monto).toBe(4000);
  });

  /** En mixto el resto y el transporte van en efectivo, y asi se le dijo. */
  it('en pago mixto espera solo la parte transferida', () => {
    const monto = update.montoEsperadoDeTransferencia(
      {
        duracionPactadaHoras: 3,
        metodoPago: 'mixto',
        mixedTransferAmount: 1000,
        customerTransportCharge: 350,
      },
      empleada,
    );
    expect(monto).toBe(1000);
  });
});

/**
 * El bloqueo que dejaba la reserva muerta: cualquier foto mandada durante la
 * negociacion se guardaba como comprobante en PROCESANDO y nunca se analizaba,
 * asi que al llegar el comprobante de verdad se le contestaba "ya lo tengo" y
 * la reserva no avanzaba jamas.
 */
describe('TelegramBookingUpdate.comprobanteYaEnRevision', () => {
  let update: any;
  let repository: { findOne: jest.Mock };
  let ctx: any;

  const conValidacion = (estado: string, edadMs: number) => {
    repository.findOne.mockResolvedValue({
      id: 'val-1',
      estado,
      createdAt: new Date(Date.now() - edadMs),
    });
  };

  beforeEach(() => {
    repository = { findOne: jest.fn() };
    update = Object.create(TelegramBookingUpdate.prototype);
    update.paymentReceiptValidationsRepository = repository;
    ctx = {
      session: { comprobanteEnviado: true, comprobanteValidationId: 'val-1' },
      reply: jest.fn().mockResolvedValue(undefined),
    };
  });

  it('bloquea mientras el analisis acaba de empezar', async () => {
    conValidacion('PROCESANDO', 5_000);
    await expect(update.comprobanteYaEnRevision(ctx)).resolves.toBe(true);
    expect(ctx.reply).toHaveBeenCalled();
  });

  it('bloquea si un jefe lo tiene en revision manual', async () => {
    conValidacion('PENDIENTE_REVISION', 60 * 60 * 1000);
    await expect(update.comprobanteYaEnRevision(ctx)).resolves.toBe(true);
  });

  /** Un PROCESANDO viejo es un analisis que se quedo a medias, no una espera. */
  it('admite otro comprobante si el analisis se quedo colgado', async () => {
    conValidacion('PROCESANDO', 10 * 60 * 1000);

    await expect(update.comprobanteYaEnRevision(ctx)).resolves.toBe(false);
    expect(ctx.reply).not.toHaveBeenCalled();
    expect(ctx.session.comprobanteEnviado).toBe(false);
    expect(ctx.session.comprobanteValidationId).toBeUndefined();
  });

  it('admite otro comprobante si el anterior fue rechazado', async () => {
    conValidacion('RECHAZADO', 1_000);
    await expect(update.comprobanteYaEnRevision(ctx)).resolves.toBe(false);
  });

  it('no bloquea cuando no hay ningun comprobante previo', async () => {
    ctx.session = {};
    await expect(update.comprobanteYaEnRevision(ctx)).resolves.toBe(false);
    expect(repository.findOne).not.toHaveBeenCalled();
  });
});

/**
 * La foto que el cliente adelanta antes de que se cierre el precio se guarda
 * sin analizar, y se valida en cuanto se sabe cuanto tiene que decir. Antes se
 * daba por buena de entrada, lo que ademas forzaba el metodo de pago a
 * transferencia aunque el cliente no hubiera dicho nada.
 */
describe('TelegramBookingUpdate.aprovecharComprobanteAdelantado', () => {
  let update: any;
  let ctx: any;

  beforeEach(() => {
    update = Object.create(TelegramBookingUpdate.prototype);
    update.validarComprobanteDeReserva = jest.fn().mockResolvedValue(undefined);
    ctx = { session: {} };
  });

  it('valida la foto adelantada en vez de volver a pedirla', async () => {
    ctx.session.comprobanteAdelantadoFileId = 'file-1';

    await expect(update.aprovecharComprobanteAdelantado(ctx)).resolves.toBe(
      true,
    );
    expect(update.validarComprobanteDeReserva).toHaveBeenCalledWith(
      ctx,
      'file-1',
    );
    // Se consume: si el analisis la rechaza, la siguiente foto es la del cliente.
    expect(ctx.session.comprobanteAdelantadoFileId).toBeUndefined();
  });

  it('no hace nada si el cliente no adelanto ninguna foto', async () => {
    await expect(update.aprovecharComprobanteAdelantado(ctx)).resolves.toBe(
      false,
    );
    expect(update.validarComprobanteDeReserva).not.toHaveBeenCalled();
  });
});

/**
 * El servicio que nace cuando el jefe aprueba un comprobante en revision.
 *
 * `finalizeBooking` leia la ubicacion, el transporte, el trio y la cita
 * programada de `ctx.session`, pero ahi quien pulsa "Aprobar" es el jefe: su
 * sesion no tiene nada de eso y el servicio se creaba sin el cargo de
 * transporte que ya se le habia cotizado al cliente.
 */
describe('TelegramBookingUpdate.datosDeReservaDeSesion', () => {
  const update: any = Object.create(TelegramBookingUpdate.prototype);

  it('recoge lo que la conversacion con el cliente dejo decidido', () => {
    const datos = update.datosDeReservaDeSesion({
      presetLocationId: 'loc-1',
      locationNameSnapshot: 'Motel Luna',
      locationAddressSnapshot: 'Calle 1',
      customerTransportCharge: 350,
      duracionIndefinida: true,
      trioStatus: 'confirmed',
      trioSelectedEmployeeName: 'Sofia',
      trioCombinedRatePerHour: 2400,
      tipoAgenda: 'programado',
      fechaProgramada: '2026-09-01T20:00:00.000Z',
      bookingSessionId: 'booking-1',
    });

    expect(datos).toEqual({
      presetLocationId: 'loc-1',
      locationNameSnapshot: 'Motel Luna',
      locationAddressSnapshot: 'Calle 1',
      customerTransportCharge: 350,
      duracionIndefinida: true,
      trioConfirmado: true,
      trioNombre: 'Sofia',
      trioTarifaCombinada: 2400,
      tipoAgenda: 'programado',
      fechaProgramada: '2026-09-01T20:00:00.000Z',
      bookingSessionId: 'booking-1',
    });
  });

  /** Es lo que recibe el jefe: su sesion no sabe nada de esta reserva. */
  it('sin sesion devuelve valores neutros, no valores inventados', () => {
    const datos = update.datosDeReservaDeSesion(undefined);

    expect(datos.customerTransportCharge).toBe(0);
    expect(datos.presetLocationId).toBeNull();
    expect(datos.trioConfirmado).toBe(false);
    expect(datos.tipoAgenda).toBe('inmediato');
    expect(datos.bookingSessionId).toBeNull();
  });

  /** Un trio pedido pero no autorizado por el jefe no cambia la tarifa. */
  it('no da por confirmado un trio que sigue pendiente', () => {
    const datos = update.datosDeReservaDeSesion({
      trioStatus: 'pending_boss',
      trioSelectedEmployeeName: 'Sofia',
      trioCombinedRatePerHour: 2400,
    });

    expect(datos.trioConfirmado).toBe(false);
  });
});
