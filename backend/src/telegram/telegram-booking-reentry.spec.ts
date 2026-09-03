import { TelegramBookingUpdate } from './telegram-booking.update';

/**
 * Volver al catalogo y pulsar "contratar" otra vez no puede borrar lo negociado.
 *
 * `startHireSession` reseteaba la sesion siempre, y aqui se llega tanto desde el
 * boton del bot como desde el enlace `/start` de la web. Un cliente que volvia
 * al catalogo un rato despues --por mirar fotos, por dudar-- perdia las horas,
 * el pago y la ubicacion que ya habia dado, y la modelo lo saludaba de nuevo con
 * su tarifa como si no se hubieran hablado nunca. Encima cada reentrada abria un
 * `bookingSessionId` nuevo: el historial de un mismo cliente quedaba partido en
 * hilos paralelos que nadie podia leer juntos.
 */
describe('TelegramBookingUpdate.startHireSession al reentrar', () => {
  let update: any;
  let ctx: any;
  const EMPLEADA_ID = 'emp-1';

  const sesionNegociada = (edadMs: number) => ({
    step: 'CHAT_CON_EMPLEADA',
    empleadaId: EMPLEADA_ID,
    bookingSessionId: 'draft-1',
    hireStartedAt: new Date(Date.now() - edadMs).toISOString(),
    duracionPactadaHoras: 2,
    metodoPago: 'efectivo',
    locationNameSnapshot: 'Majestic',
    chatHistory: [{ role: 'user', parts: [{ text: 'Hola' }] }],
  });

  beforeEach(() => {
    process.env.XAI_API_KEY = 'test-key';
    update = Object.create(TelegramBookingUpdate.prototype);
    update.empleadasRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: EMPLEADA_ID,
        nombreArtistico: 'Lola',
        catalogoActivo: true,
        disponible: true,
        usuario: { enJornada: true },
      }),
    };
    // Sin servicio en curso para esta empleada.
    update.serviciosRepository = { findOne: jest.fn().mockResolvedValue(null) };
    update.recordDraftConversation = jest.fn().mockResolvedValue(undefined);
    update.registrarMensajeDelFlujo = jest.fn().mockResolvedValue(undefined);
    update.persistSession = jest.fn().mockResolvedValue(undefined);
    update.logger = { warn: jest.fn(), error: jest.fn() };

    // Lo que necesita el camino de contratacion nueva para llegar al saludo.
    update.extrasCatalogoRepository = { find: jest.fn().mockResolvedValue([]) };
    update.transportOperations = {
      activeLocations: jest.fn().mockResolvedValue([]),
      externalLocationFee: jest.fn().mockResolvedValue(0),
    };
    update.getEmployeeBusySchedules = jest.fn().mockResolvedValue([]);
    update.getAvailableTrioEmployees = jest.fn().mockResolvedValue([]);
    update.getAvailableEmployeesForPrompt = jest.fn().mockResolvedValue([]);
    update.tieneFotosExclusivas = jest.fn().mockResolvedValue(false);
    update.getGroqResponse = jest.fn().mockResolvedValue('Hola papi');
    update.dressAiReply = jest.fn((texto: string) => texto);
    update.sendDelayedReply = jest.fn().mockResolvedValue(undefined);
    ctx = {
      from: { id: 55 },
      reply: jest.fn().mockResolvedValue(undefined),
      sendChatAction: jest.fn().mockResolvedValue(undefined),
      session: undefined,
    };
  });

  it('conserva lo negociado si vuelve pronto con la misma modelo', async () => {
    ctx.session = sesionNegociada(20 * 60 * 1000);

    await update.startHireSession(ctx, EMPLEADA_ID);

    expect(ctx.session.bookingSessionId).toBe('draft-1');
    expect(ctx.session.duracionPactadaHoras).toBe(2);
    expect(ctx.session.metodoPago).toBe('efectivo');
    expect(ctx.session.locationNameSnapshot).toBe('Majestic');
    expect(ctx.session.step).toBe('CHAT_CON_EMPLEADA');
    // Retoma en vez de volver a saludar con la tarifa.
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('seguimos donde quedamos'),
    );
  });

  it('arranca de cero si la contratacion previa ya esta rancia', async () => {
    ctx.session = sesionNegociada(9 * 60 * 60 * 1000);

    await update.startHireSession(ctx, EMPLEADA_ID);

    expect(ctx.session.bookingSessionId).not.toBe('draft-1');
    expect(ctx.session.duracionPactadaHoras).toBeUndefined();
    expect(ctx.session.metodoPago).toBeUndefined();
  });

  it('arranca de cero si el cliente cambio de modelo', async () => {
    ctx.session = sesionNegociada(20 * 60 * 1000);
    update.empleadasRepository.findOne.mockResolvedValue({
      id: 'emp-2',
      nombreArtistico: 'Valentina',
      catalogoActivo: true,
      disponible: true,
      usuario: { enJornada: true },
    });

    await update.startHireSession(ctx, 'emp-2');

    expect(ctx.session.empleadaId).toBe('emp-2');
    expect(ctx.session.bookingSessionId).not.toBe('draft-1');
    expect(ctx.session.duracionPactadaHoras).toBeUndefined();
  });

  /*
   * Con la reserva ya cerrada esperando comprobante el servicio existe y el jefe
   * lo tiene delante: resetear aqui haria que la foto que llegue despues diera
   * de alta un segundo servicio.
   */
  it('no toca la sesion si la reserva ya espera el comprobante', async () => {
    ctx.session = {
      ...sesionNegociada(5 * 60 * 1000),
      servicioPendienteComprobanteId: 'srv-1',
    };

    await update.startHireSession(ctx, EMPLEADA_ID);

    expect(ctx.session.servicioPendienteComprobanteId).toBe('srv-1');
    expect(ctx.session.bookingSessionId).toBe('draft-1');
    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('Ya tenemos apartado'),
    );
  });

  it('la contratacion nueva queda fechada para el proximo reingreso', async () => {
    ctx.session = {};

    await update.startHireSession(ctx, EMPLEADA_ID);

    expect(ctx.session.hireStartedAt).toBeDefined();
    expect(Date.parse(ctx.session.hireStartedAt)).not.toBeNaN();
  });
});
