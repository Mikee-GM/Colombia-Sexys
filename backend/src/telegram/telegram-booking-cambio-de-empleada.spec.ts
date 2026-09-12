import { TelegramBookingUpdate } from './telegram-booking.update';

/**
 * Pedir a otra modelo tiene que terminar la conversacion con la anterior.
 *
 * Cuando la que se elige no puede atender --inactiva en el catalogo, fuera de
 * jornada o marcada como no disponible-- el bot le ofrecia la lista de las que
 * si, pero la sesion seguia apuntando a la modelo de antes con su paso de
 * conversacion puesto. El siguiente mensaje del cliente lo contestaba ELLA, asi
 * que despues de cancelar un servicio y pedir a otra el bot respondia como si
 * nunca hubiera cambiado nada.
 */
describe('TelegramBookingUpdate.startHireSession al cambiar de modelo', () => {
  let update: any;
  let ctx: any;

  const sesionConLaPrimera = () => ({
    step: 'CHAT_CON_EMPLEADA',
    empleadaId: 'emp-primera',
    bookingSessionId: 'draft-1',
    hireStartedAt: new Date().toISOString(),
    duracionPactadaHoras: 2,
    metodoPago: 'efectivo',
    chatHistory: [{ role: 'user', parts: [{ text: 'Hola' }] }],
  });

  beforeEach(() => {
    process.env.XAI_API_KEY = 'test-key';
    update = Object.create(TelegramBookingUpdate.prototype);
    update.logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };
    update.serviciosRepository = { findOne: jest.fn().mockResolvedValue(null) };
    update.persistSession = jest.fn().mockResolvedValue(undefined);
    update.replyWithAvailableEmployees = jest.fn().mockResolvedValue(undefined);
    update.recordDraftConversation = jest.fn().mockResolvedValue(undefined);
    update.registrarMensajeDelFlujo = jest.fn().mockResolvedValue(undefined);

    ctx = { session: sesionConLaPrimera(), reply: jest.fn() };
  });

  const conLaSegunda = (empleada: Record<string, unknown> | null) => {
    update.empleadasRepository = {
      findOne: jest.fn().mockResolvedValue(empleada),
    };
  };

  it('olvida a la primera cuando la nueva no esta en el catalogo', async () => {
    conLaSegunda(null);

    await update.startHireSession(ctx, 'emp-segunda');

    expect(ctx.session.empleadaId).toBeUndefined();
    expect(ctx.session.step).toBeUndefined();
    expect(update.replyWithAvailableEmployees).toHaveBeenCalled();
    // La sesion limpia tiene que quedar guardada: si solo se limpiara en
    // memoria, el siguiente mensaje volveria a leer la de antes.
    expect(update.persistSession).toHaveBeenCalled();
  });

  it('olvida a la primera cuando la nueva ya cerro su jornada', async () => {
    conLaSegunda({
      id: 'emp-segunda',
      nombreArtistico: 'Camila',
      catalogoActivo: true,
      disponible: true,
      usuario: { enJornada: false },
    });

    await update.startHireSession(ctx, 'emp-segunda');

    expect(ctx.session.empleadaId).toBeUndefined();
    expect(ctx.session.chatHistory).toBeUndefined();
  });

  it('olvida a la primera cuando la nueva no esta disponible', async () => {
    conLaSegunda({
      id: 'emp-segunda',
      nombreArtistico: 'Camila',
      catalogoActivo: true,
      disponible: false,
      usuario: { enJornada: true },
    });

    await update.startHireSession(ctx, 'emp-segunda');

    expect(ctx.session.empleadaId).toBeUndefined();
    expect(ctx.session.metodoPago).toBeUndefined();
  });

  /*
   * Lo que describe al cliente y no a la contratacion se conserva: sin esto la
   * explicacion del rechazo se le repetiria en cada mensaje.
   */
  it('conserva que ya se le explico el rechazo anterior', async () => {
    ctx.session.rechazoAvisadoServicioId = 'srv-rechazado';
    conLaSegunda(null);

    await update.startHireSession(ctx, 'emp-segunda');

    expect(ctx.session.rechazoAvisadoServicioId).toBe('srv-rechazado');
    expect(ctx.session.empleadaId).toBeUndefined();
  });
});
