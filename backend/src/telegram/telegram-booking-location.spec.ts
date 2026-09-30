import { TelegramBookingUpdate } from './telegram-booking.update';

/**
 * El manejador vive en una clase con dos docenas de dependencias inyectadas.
 * Estas pruebas cubren la lógica que causó el fallo, así que se invocan sus
 * métodos sobre un objeto vacío en lugar de levantar el módulo entero.
 */
type Privados = {
  messageBufferKey(telegramId: string, empleadaId: string): string;
  adelantarBufferDelCliente(telegramId: string, empleadaId: string): boolean;
  recordLocationInHistory(
    session: Record<string, unknown>,
    descripcion?: string | null,
  ): void;
  clientMessageBuffers: Map<string, unknown>;
  flushClientMessageBuffer: unknown;
};

const comoPrivados = (instancia: unknown) => instancia as Privados;

function nuevaInstancia() {
  const instancia = Object.create(
    TelegramBookingUpdate.prototype,
  ) as TelegramBookingUpdate;
  const privados = comoPrivados(instancia);
  privados.clientMessageBuffers = new Map();
  return { instancia, privados };
}

describe('Llegada del pin de ubicación', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /**
   * El fallo que cubre esta prueba: el texto del cliente se agrupa 20 s antes
   * de pasárselo a la IA. Si en mitad de esa ventana llegaba el pin —que tiene
   * su propio manejador y contesta al instante—, el cliente recibía un acuse
   * automático y, casi veinte segundos después, una respuesta de la IA que
   * ignoraba el pin y volvía a pedir la ubicación.
   */
  it('adelanta el vaciado del buffer cuando llega el pin', () => {
    const { instancia, privados } = nuevaInstancia();
    const flush = jest.fn();
    (
      instancia as unknown as { flushClientMessageBuffer: unknown }
    ).flushClientMessageBuffer = flush;

    const clave = privados.messageBufferKey('99', 'emp-1');
    const empleada = { id: 'emp-1' } as never;
    const timerOriginal = setTimeout(() => flush(clave, empleada), 20_000);
    privados.clientMessageBuffers.set(clave, {
      messages: ['si, ahorita te mando el pin'],
      timer: timerOriginal,
      ctx: {},
      empleada,
    });

    expect(privados.adelantarBufferDelCliente('99', 'emp-1')).toBe(true);

    // A los 20 s originales ya tendría que haber corrido hace mucho.
    jest.advanceTimersByTime(2_000);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(clave, empleada);
  });

  it('no adelanta nada si el cliente no tenía mensajes pendientes', () => {
    const { privados } = nuevaInstancia();
    expect(privados.adelantarBufferDelCliente('99', 'emp-1')).toBe(false);
  });

  it('distingue el buffer de cada modelo para el mismo cliente', () => {
    const { privados } = nuevaInstancia();
    privados.clientMessageBuffers.set(
      privados.messageBufferKey('99', 'emp-1'),
      {
        messages: [],
        timer: setTimeout(() => undefined, 20_000),
        ctx: {},
        empleada: {},
      },
    );
    expect(privados.adelantarBufferDelCliente('99', 'emp-2')).toBe(false);
  });

  /**
   * El prompt ya llevaba la ubicación confirmada, pero el modelo se guía por el
   * hilo de la conversación y ahí el pin no aparecía: como su último turno
   * había sido pedir la ubicación, la volvía a pedir.
   */
  it('deja constancia del pin en el historial, como turno del cliente', () => {
    const { privados } = nuevaInstancia();
    const session: Record<string, unknown> = {
      chatHistory: [
        { role: 'model', parts: [{ text: 'Mándame tu ubicación' }] },
      ],
    };

    privados.recordLocationInHistory(session, 'Motel Las Palmas');

    const history = session.chatHistory as {
      role: string;
      parts: { text: string }[];
    }[];
    const ultimo = history[history.length - 1];
    expect(ultimo.role).toBe('user');
    expect(ultimo.parts[0].text).toContain('Motel Las Palmas');
    expect(ultimo.parts[0].text).toMatch(/ubicaci[oó]n/i);
  });

  it('registra el pin aunque no se sepa el nombre del lugar', () => {
    const { privados } = nuevaInstancia();
    const session: Record<string, unknown> = {};

    privados.recordLocationInHistory(session, null);

    const history = session.chatHistory as { role: string }[];
    expect(history).toHaveLength(1);
    expect(history[0].role).toBe('user');
  });
});

/**
 * Telegram refresca una ubicacion en vivo mandando `edited_message` cada pocos
 * segundos mientras dura el envio, y todos caen en el mismo manejador que el
 * pin normal. Las ramas de chofer y de empleada ya los distinguian; la del
 * cliente no, asi que cada refresco le volvia a contestar y el bot se quedaba
 * repitiendose durante minutos.
 */
describe('Refrescos de una ubicación en vivo del cliente', () => {
  const COORDENADAS = { latitude: 19.4326, longitude: -99.1332 };

  function nuevaInstanciaDeCliente() {
    const instancia = Object.create(TelegramBookingUpdate.prototype);
    // Un cliente no es de la casa: `registrarPorTelegram` devuelve null y el
    // manejador sigue con el flujo del cliente, que es lo que se prueba aqui.
    instancia.locationsService = {
      registrarPorTelegram: jest.fn().mockResolvedValue(null),
    };
    instancia.usuariosRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    };
    instancia.logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
    instancia.groupServicesService = {
      findActiveRequestByClientTelegram: jest.fn().mockResolvedValue(null),
      setLocationFromClient: jest.fn(),
    };
    instancia.persistSession = jest.fn();
    return instancia;
  }

  const contexto = (
    session: Record<string, unknown>,
    { editado }: { editado: boolean },
  ) => {
    const mensaje = { location: COORDENADAS };
    return {
      from: { id: 77 },
      chat: { type: 'private' },
      session,
      message: editado ? undefined : mensaje,
      editedMessage: editado ? mensaje : undefined,
      update: editado ? { edited_message: mensaje } : {},
      reply: jest.fn(),
    };
  };

  it('no le contesta al cliente en cada refresco', async () => {
    const instancia = nuevaInstanciaDeCliente();
    const ctx = contexto(
      {
        empleadaId: 'emp-1',
        step: 'CHAT_CON_EMPLEADA',
        locationLat: '19.0000',
        locationLng: '-99.0000',
      },
      { editado: true },
    );

    await instancia.onLocation(ctx);

    expect(ctx.reply).not.toHaveBeenCalled();
    // El pin si se mueve: el servicio debe salir con la ultima posicion.
    expect(ctx.session.locationLat).toBe('19.4326');
    expect(ctx.session.locationLng).toBe('-99.1332');
    expect(instancia.persistSession).toHaveBeenCalled();
  });

  it('tampoco regaña al que todavía no tiene una contratación abierta', async () => {
    // Este era el peor caso: sin contratacion, cada refresco disparaba el
    // "inicia la contratacion desde el catalogo".
    const instancia = nuevaInstanciaDeCliente();
    const ctx = contexto({}, { editado: true });

    await instancia.onLocation(ctx);

    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('mueve el pin de una solicitud de grupo sin contestar', async () => {
    const instancia = nuevaInstanciaDeCliente();
    instancia.groupServicesService.findActiveRequestByClientTelegram.mockResolvedValue(
      { id: 'req-1', serviceId: null },
    );
    const ctx = contexto({ step: 'GROUP_WITH_BOSS' }, { editado: true });

    await instancia.onLocation(ctx);

    expect(
      instancia.groupServicesService.setLocationFromClient,
    ).toHaveBeenCalledWith(
      'req-1',
      COORDENADAS.latitude,
      COORDENADAS.longitude,
    );
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('no reescribe la ubicación de un servicio ya creado', async () => {
    // Su direccion ya viajo al chofer y a la empleada: cambiarla por detras los
    // mandaria a otro sitio sin que nadie se entere.
    const instancia = nuevaInstanciaDeCliente();
    instancia.groupServicesService.findActiveRequestByClientTelegram.mockResolvedValue(
      { id: 'req-1', serviceId: 'srv-1' },
    );
    const ctx = contexto({ step: 'GROUP_WITH_BOSS' }, { editado: true });

    await instancia.onLocation(ctx);

    expect(
      instancia.groupServicesService.setLocationFromClient,
    ).not.toHaveBeenCalled();
  });

  it('sigue respondiendo al primer pin, que no llega editado', async () => {
    const instancia = nuevaInstanciaDeCliente();
    const ctx = contexto({}, { editado: false });

    await instancia.onLocation(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(
      expect.stringContaining('inicia la contratación'),
    );
  });
});

/**
 * Tras un rechazo, el hilo del servicio se borra del grupo del jefe, asi que
 * nadie va a escribirle al cliente. El "en un ratico te respondemos" del final
 * de `onMessage` lo dejaba esperando una respuesta que no existia.
 */
describe('Cliente que escribe después de un servicio rechazado', () => {
  const RECHAZADO = {
    id: 'srv-1',
    estado: 'cancelado',
    motivoCancelacion: 'rechazado_por_jefe',
    canceladoAt: new Date(),
    empleada: { nombreArtistico: 'Valeria' },
  };

  function nuevaInstancia() {
    const instancia = Object.create(TelegramBookingUpdate.prototype);
    instancia.serviciosRepository = { findOne: jest.fn() };
    instancia.persistSession = jest.fn();
    instancia.replyWithAvailableEmployees = jest.fn();
    return instancia;
  }

  const contexto = (session: Record<string, unknown> = {}) => ({
    session,
    reply: jest.fn(),
  });

  it('le explica que no estuvo disponible y le ofrece a las demás', async () => {
    const instancia = nuevaInstancia();
    instancia.serviciosRepository.findOne.mockResolvedValue(RECHAZADO);
    const ctx = contexto();

    const atendido = await instancia.ofrecerAlternativasTrasRechazo(ctx, '77');

    expect(atendido).toBe(true);
    const [, intro] = instancia.replyWithAvailableEmployees.mock.calls[0];
    expect(intro).toContain('Valeria');
    expect(intro).toMatch(/no pudo tomar el servicio/i);
    // Queda anotado para no repetirle la explicacion en cada mensaje.
    expect(ctx.session.rechazoAvisadoServicioId).toBe('srv-1');
    expect(instancia.persistSession).toHaveBeenCalled();
  });

  it('no le repite la explicación en el segundo mensaje, pero sí la lista', async () => {
    const instancia = nuevaInstancia();
    instancia.serviciosRepository.findOne.mockResolvedValue(RECHAZADO);
    const ctx = contexto({ rechazoAvisadoServicioId: 'srv-1' });

    const atendido = await instancia.ofrecerAlternativasTrasRechazo(ctx, '77');

    expect(atendido).toBe(true);
    const [, intro] = instancia.replyWithAvailableEmployees.mock.calls[0];
    expect(intro).not.toMatch(/no pudo tomar el servicio/i);
    expect(intro).toMatch(/disponibles/i);
    expect(instancia.persistSession).not.toHaveBeenCalled();
  });

  it('no se hace cargo si el último servicio no fue rechazado por el jefe', async () => {
    // Una cancelacion del propio cliente no se explica con "no estuvo
    // disponible", asi que el mensaje sigue su curso normal.
    const instancia = nuevaInstancia();
    instancia.serviciosRepository.findOne.mockResolvedValue({
      ...RECHAZADO,
      motivoCancelacion: 'cancelado_por_cliente',
    });

    const atendido = await instancia.ofrecerAlternativasTrasRechazo(
      contexto(),
      '77',
    );

    expect(atendido).toBe(false);
    expect(instancia.replyWithAvailableEmployees).not.toHaveBeenCalled();
  });

  it('no explica un rechazo viejo', async () => {
    const instancia = nuevaInstancia();
    instancia.serviciosRepository.findOne.mockResolvedValue({
      ...RECHAZADO,
      canceladoAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
    });

    const atendido = await instancia.ofrecerAlternativasTrasRechazo(
      contexto(),
      '77',
    );

    expect(atendido).toBe(false);
  });

  it('no se hace cargo de un cliente sin servicios', async () => {
    const instancia = nuevaInstancia();
    instancia.serviciosRepository.findOne.mockResolvedValue(null);

    const atendido = await instancia.ofrecerAlternativasTrasRechazo(
      contexto(),
      '77',
    );

    expect(atendido).toBe(false);
  });
});
