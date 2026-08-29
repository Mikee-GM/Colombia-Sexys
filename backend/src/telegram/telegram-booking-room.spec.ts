import {
  BOTON_ACEPTAR_SERVICIO,
  BOTON_RECHAZAR_SERVICIO,
  TelegramBookingUpdate,
} from './telegram-booking.update';

/**
 * El paso en el que el jefe escribe la habitacion, despues de dar el visto
 * bueno desde el grupo.
 *
 * Se tragaba cualquier texto, y el teclado de autorizar sigue puesto mientras
 * espera: pulsar "Rechazar Servicio" ACEPTABA el servicio con esa frase dentro
 * como numero de habitacion, despachaba chofer y avisaba al cliente. El jefe
 * creia haberlo rechazado.
 */
describe('TelegramBookingUpdate: la habitación tras autorizar', () => {
  let update: any;
  let servicesService: { aceptar: jest.Mock };
  let usuarios: { findOne: jest.Mock };
  let ctx: any;

  const conTexto = (texto: string, sesion: Record<string, unknown> = {}) => ({
    from: { id: 99 },
    chat: { id: -100, type: 'supergroup' },
    message: { text: texto },
    reply: jest.fn().mockResolvedValue(undefined),
    session: {
      step: 'AWAITING_ROOM',
      roomServiceId: 'srv-1',
      roomAskedAt: Date.now(),
      ...sesion,
    },
  });

  beforeEach(() => {
    jest.clearAllMocks();
    servicesService = { aceptar: jest.fn().mockResolvedValue(undefined) };
    usuarios = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'jefe-1', rol: 'jefe', email: 'j@e.fe' }),
    };
    update = Object.create(TelegramBookingUpdate.prototype);
    update.servicesService = servicesService;
    update.usuariosRepository = usuarios;
    update.logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
    // Nada mas del manejador debe correr: solo interesa este paso.
    update.manualServiceWizard = {
      manejarTexto: jest.fn().mockResolvedValue(false),
    };
    update.clienteBloqueado = jest.fn().mockResolvedValue(false);
  });

  it('acepta el servicio con la habitación que escribió el jefe', async () => {
    ctx = conTexto('204');
    await update.onMessage(ctx);

    expect(servicesService.aceptar).toHaveBeenCalledWith(
      'srv-1',
      'jefe-1',
      'chofer',
      undefined,
      '204',
    );
    expect(ctx.session.step).toBeUndefined();
  });

  it('acepta sin habitación cuando el servicio es a domicilio', async () => {
    ctx = conTexto('No');
    await update.onMessage(ctx);

    expect(servicesService.aceptar).toHaveBeenCalledWith(
      'srv-1',
      'jefe-1',
      'chofer',
      undefined,
      undefined,
    );
  });

  /** El fallo que motiva esta prueba: rechazar acababa aceptando. */
  it('no acepta el servicio si el jefe pulsa Rechazar mientras se espera', async () => {
    ctx = conTexto(BOTON_RECHAZAR_SERVICIO);
    await update.onMessage(ctx);

    expect(servicesService.aceptar).not.toHaveBeenCalled();
    // El paso se suelta para que el mensaje llegue a quien sabe rechazar.
    expect(ctx.session.step).toBeUndefined();
    expect(ctx.session.roomServiceId).toBeUndefined();
  });

  /** Volver a pulsar "Aceptar" no es un número de habitación. */
  it('no toma el botón de aceptar como habitación', async () => {
    ctx = conTexto(BOTON_ACEPTAR_SERVICIO);
    await update.onMessage(ctx);

    expect(servicesService.aceptar).not.toHaveBeenCalled();
    expect(ctx.session.step).toBe('AWAITING_ROOM');
    expect(ctx.reply).toHaveBeenCalled();
  });

  it('deja salir del paso escribiendo cancelar', async () => {
    ctx = conTexto('cancelar');
    await update.onMessage(ctx);

    expect(servicesService.aceptar).not.toHaveBeenCalled();
    expect(ctx.session.step).toBeUndefined();
  });

  /**
   * Mientras espera la habitacion, este paso se queda con todo lo que el jefe
   * escriba en el tema y el cliente no recibe nada. Pasado el plazo se suelta.
   */
  it('deja de esperar la habitación pasado el plazo', async () => {
    ctx = conTexto('un mensaje para el cliente', {
      roomAskedAt: Date.now() - 60 * 60 * 1000,
    });
    await update.onMessage(ctx);

    expect(servicesService.aceptar).not.toHaveBeenCalled();
    expect(ctx.session.step).toBeUndefined();
    expect(ctx.session.roomServiceId).toBeUndefined();
  });
});
