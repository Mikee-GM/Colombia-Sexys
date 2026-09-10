import { TelegramBookingUpdate } from './telegram-booking.update';

/**
 * El fallo que cubren estas pruebas.
 *
 * El cierre de la contratación colgaba entero de que el modelo escribiera la
 * marca `[DATA]` al final de su respuesta. Cuando no la escribía --y no la
 * escribe siempre-- el turno terminaba en una frase suelta del tipo "te aviso
 * en un momentico cómo nos organizamos" y ahí se acababa la reserva: no nacía
 * el servicio, el jefe no recibía nada que autorizar y el cliente se quedaba
 * esperando. Los datos ya estaban en la sesión; lo único que faltaba era la
 * marca.
 *
 * La clase tiene dos docenas de dependencias inyectadas, así que se invocan
 * sus métodos sobre un objeto vacío en lugar de levantar el módulo entero.
 */
type Privados = {
  cerrarContratacionSiEstaCompleta(
    ctx: unknown,
    session: Record<string, unknown>,
    history: { role: string; parts: { text: string }[] }[],
    cleanText: string,
    ubicacionCandidata: unknown,
  ): Promise<boolean>;
  buscarUbicacionMencionadaPorElCliente(textos: string[]): Promise<unknown>;
  buscarUbicacionPorNombre(nombre: unknown): Promise<unknown>;
  mensajeSinConversacionAbierta(client: { nombreTelegram?: string }): string;
  transportOperations: { activeLocations: jest.Mock };
  configService: { get: jest.Mock };
  logger: { error: jest.Mock; warn: jest.Mock };
  sendDelayedReply: jest.Mock;
  recordDraftConversation: jest.Mock;
  applyDraftPaymentMethod: jest.Mock;
  onLocation: jest.Mock;
  replyWithServiceLocationOptions: jest.Mock;
};

const MONTECARLO = {
  id: 'loc-1',
  name: 'Motel Montecarlo',
  address: 'Av. Siempre Viva 1',
  latitude: '20.58',
  longitude: '-100.39',
};
const MAJESTIC = {
  id: 'loc-2',
  name: 'Majestic',
  address: 'Calle Falsa 2',
  latitude: '20.6',
  longitude: '-100.4',
};

function nuevaInstancia(ubicaciones = [MONTECARLO, MAJESTIC]) {
  const instancia = Object.create(
    TelegramBookingUpdate.prototype,
  ) as TelegramBookingUpdate;
  const privados = instancia as unknown as Privados;

  privados.transportOperations = {
    activeLocations: jest.fn().mockResolvedValue(ubicaciones),
  };
  privados.configService = { get: jest.fn().mockReturnValue(undefined) };
  privados.logger = { error: jest.fn(), warn: jest.fn() };
  privados.sendDelayedReply = jest.fn().mockResolvedValue(undefined);
  privados.recordDraftConversation = jest.fn().mockResolvedValue(undefined);
  // Devuelve si la reserva quedo cerrada: de eso depende que la frase de la
  // IA se mande o la sustituya el resumen.
  privados.applyDraftPaymentMethod = jest.fn().mockResolvedValue(true);
  privados.onLocation = jest.fn().mockResolvedValue(undefined);
  privados.replyWithServiceLocationOptions = jest
    .fn()
    .mockResolvedValue(undefined);

  return privados;
}

const historialVacio = () =>
  [] as { role: string; parts: { text: string }[] }[];

describe('Cierre de la contratación sin la marca [DATA]', () => {
  it('no cierra nada mientras falte el método de pago', async () => {
    const p = nuevaInstancia();
    const session: Record<string, unknown> = { duracionPactadaHoras: 3 };

    const seHizoCargo = await p.cerrarContratacionSiEstaCompleta(
      {},
      session,
      historialVacio(),
      'Uy qué rico, ¿y cómo prefieres pagar?',
      null,
    );

    expect(seHizoCargo).toBe(false);
    expect(p.onLocation).not.toHaveBeenCalled();
    expect(p.replyWithServiceLocationOptions).not.toHaveBeenCalled();
  });

  it('tampoco cierra si hay pago pero no hay horas', async () => {
    const p = nuevaInstancia();
    const session: Record<string, unknown> = { metodoPago: 'efectivo' };

    expect(
      await p.cerrarContratacionSiEstaCompleta(
        {},
        session,
        historialVacio(),
        'Listo mor.',
        null,
      ),
    ).toBe(false);
  });

  /**
   * El caso de la captura: 3 horas, en Montecarlo y en efectivo, y la
   * conversación se quedaba muerta. Con el motel reconocido el cierre continúa
   * por `onLocation`, que es quien crea el servicio, avisa al jefe y le manda
   * el resumen al cliente.
   */
  it('cierra por el motel reconocido cuando el modelo no puso la marca', async () => {
    const p = nuevaInstancia();
    const session: Record<string, unknown> = {
      duracionPactadaHoras: 3,
      metodoPago: 'efectivo',
    };

    const seHizoCargo = await p.cerrarContratacionSiEstaCompleta(
      {},
      session,
      historialVacio(),
      'Listo, amor. Entonces nos vemos en Montecarlo.',
      MONTECARLO,
    );

    expect(seHizoCargo).toBe(true);
    expect(session.presetLocationId).toBe('loc-1');
    expect(session.locationNameSnapshot).toBe('Motel Montecarlo');
    expect(session.customerTransportCharge).toBe(0);
    expect(p.onLocation).toHaveBeenCalledWith(
      {},
      {
        latitude: 20.58,
        longitude: -100.39,
        title: 'Motel Montecarlo',
        address: 'Av. Siempre Viva 1',
      },
    );
  });

  it('con el pin ya confirmado sigue por el método de pago, sin volver a pedir ubicación', async () => {
    const p = nuevaInstancia();
    const session: Record<string, unknown> = {
      duracionPactadaHoras: 2,
      metodoPago: 'transferencia',
      locationLat: '20.5',
      locationLng: '-100.3',
    };

    expect(
      await p.cerrarContratacionSiEstaCompleta(
        {},
        session,
        historialVacio(),
        'Perfecto mi amor.',
        null,
      ),
    ).toBe(true);
    expect(p.applyDraftPaymentMethod).toHaveBeenCalledWith({}, 'transferencia');
    expect(p.replyWithServiceLocationOptions).not.toHaveBeenCalled();
  });

  /**
   * Sin motel reconocido tampoco puede quedarse callado: se le pide el pin con
   * el listado de moteles, que es lo que deja la conversación viva.
   */
  it('sin ubicación pide el pin en vez de contestar y callarse', async () => {
    const p = nuevaInstancia();
    const session: Record<string, unknown> = {
      duracionIndefinida: true,
      metodoPago: 'tarjeta',
    };

    expect(
      await p.cerrarContratacionSiEstaCompleta(
        {},
        session,
        historialVacio(),
        'Listo mor, ¿dónde nos vemos?',
        null,
      ),
    ).toBe(true);
    expect(p.replyWithServiceLocationOptions).toHaveBeenCalledWith(
      {},
      'Listo mor, ¿dónde nos vemos?',
    );
    expect(session.step).toBe('AWAITING_LOCATION');
  });

  /**
   * Con el motel ya elegido, el resumen del servicio sale justo despues y dice
   * lo mismo con los datos. Mandar tambien la frase de la IA le dejaba al
   * cliente dos mensajes casi identicos seguidos: "dejame checar los detalles y
   * te confirmo" y, un minuto despues, "dejame checar los ultimos detallitos y
   * te confirmo". Tampoco entra al historial: el modelo no puede creer que dijo
   * algo que el cliente nunca vio.
   */
  it('no repite la frase de la IA cuando el resumen sale detras', async () => {
    const p = nuevaInstancia();
    const session: Record<string, unknown> = {
      duracionPactadaHoras: 1,
      metodoPago: 'efectivo',
    };
    const history = historialVacio();

    await p.cerrarContratacionSiEstaCompleta(
      {},
      session,
      history,
      'Listo, amor.',
      MONTECARLO,
    );

    expect(p.sendDelayedReply).not.toHaveBeenCalled();
    expect(history).toEqual([]);
    expect(session.chatHistory).toBe(history);
  });

  /* Sin ubicacion no hay resumen que la sustituya: la frase si se manda. */
  it('deja la respuesta del modelo en el historial cuando aun pide el pin', async () => {
    const p = nuevaInstancia();
    const session: Record<string, unknown> = {
      duracionPactadaHoras: 1,
      metodoPago: 'efectivo',
    };
    const history = historialVacio();

    await p.cerrarContratacionSiEstaCompleta(
      {},
      session,
      history,
      'Listo, amor.',
      null,
    );

    expect(history).toEqual([
      { role: 'model', parts: [{ text: 'Listo, amor.' }] },
    ]);
    expect(session.chatHistory).toBe(history);
  });

  /*
   * Si la reserva no llega a cerrarse no hay resumen, y un turno sin respuesta
   * es como muere una conversacion.
   */
  it('responde con la frase de la IA si el cierre por pago no prospera', async () => {
    const p = nuevaInstancia();
    p.applyDraftPaymentMethod.mockResolvedValue(false);
    const session: Record<string, unknown> = {
      duracionPactadaHoras: 2,
      metodoPago: 'efectivo',
      locationLat: '20.5',
      locationLng: '-100.3',
    };
    const history = historialVacio();

    await p.cerrarContratacionSiEstaCompleta(
      {},
      session,
      history,
      'Perfecto mi amor.',
      null,
    );

    expect(p.sendDelayedReply).toHaveBeenCalledWith({}, 'Perfecto mi amor.');
    expect(history).toEqual([
      { role: 'model', parts: [{ text: 'Perfecto mi amor.' }] },
    ]);
  });
});

describe('Motel nombrado por el cliente', () => {
  it('lo encuentra dentro de una frase', async () => {
    const p = nuevaInstancia();
    expect(
      await p.buscarUbicacionMencionadaPorElCliente([
        'Quiero 3 horas en Montecarlo',
      ]),
    ).toBe(MONTECARLO);
  });

  it('no confunde el nombre con un trozo de otra palabra', async () => {
    const p = nuevaInstancia([{ ...MAJESTIC, name: 'Real' }]);
    expect(
      await p.buscarUbicacionMencionadaPorElCliente([
        'de verdad realmente me interesa',
      ]),
    ).toBeNull();
  });

  /** Los mensajes llegan del más reciente al más antiguo: gana el último. */
  it('se queda con el motel del mensaje más reciente', async () => {
    const p = nuevaInstancia();
    expect(
      await p.buscarUbicacionMencionadaPorElCliente([
        'mejor en el Majestic',
        'nos vemos en Montecarlo',
      ]),
    ).toBe(MAJESTIC);
  });

  it('ignora los acentos y las mayúsculas', async () => {
    const p = nuevaInstancia([{ ...MONTECARLO, name: 'Montecarló' }]);
    expect(
      await p.buscarUbicacionMencionadaPorElCliente(['EN MONTECARLO PORFA']),
    ).not.toBeNull();
  });

  it('no devuelve nada cuando el cliente no nombró ninguno', async () => {
    const p = nuevaInstancia();
    expect(
      await p.buscarUbicacionMencionadaPorElCliente([
        'quiero 3 horas',
        'efectivo',
      ]),
    ).toBeNull();
  });
});

describe('Cliente que escribe sin nada abierto', () => {
  it('le da el enlace del catálogo, no un "en un ratico te respondemos"', () => {
    const p = nuevaInstancia();
    p.configService.get.mockReturnValue('https://ejemplo.mx');

    const mensaje = p.mensajeSinConversacionAbierta({
      nombreTelegram: 'Yakult',
    });

    expect(mensaje).toContain('https://ejemplo.mx');
    expect(mensaje).toContain('Yakult');
    expect(mensaje).not.toContain('ratico');
  });

  it('sin WEB_URL no manda un enlace vacío y lo deja registrado', () => {
    const p = nuevaInstancia();

    const mensaje = p.mensajeSinConversacionAbierta({});

    expect(mensaje).not.toContain('http');
    expect(p.logger.error).toHaveBeenCalled();
  });
});
