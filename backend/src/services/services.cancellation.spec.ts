import { BadRequestException, ConflictException } from '@nestjs/common';
import { ServicesService } from './services.service';

/**
 * Una cancelacion tiene que dejar rastro: quien la hizo, cuando y por que.
 * Sin ese dato no se puede decidir despues si el costo lo asume el cliente,
 * la modelo o la operacion.
 */
describe('ServicesService cancel', () => {
  const serviciosRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
    // Devuelve el valor tal cual, sin `async`: el codigo lo espera igual y una
    // arrow asincrona sin await no pasa el lint.
    save: jest.fn((value) => value),
    exists: jest.fn().mockResolvedValue(false),
    manager: { getRepository: jest.fn(() => ({ update: jest.fn() })) },
  };
  const viajesRepository = { update: jest.fn(), findOne: jest.fn() };
  const choferesRepository = { findOne: jest.fn() };
  const usuariosRepository = { findOne: jest.fn(), findOneBy: jest.fn() };
  const realtime = { emitToBoss: jest.fn() };
  const bot = { telegram: { sendMessage: jest.fn() } };
  const aiMessageService = {
    generate: jest
      .fn()
      .mockResolvedValue('Que pena contigo, no voy a poder ir'),
  };
  const liquidationSync = {
    syncCancelledRecord: jest.fn().mockResolvedValue(null),
  };

  /*
   * Se construye por nombre y no con `new`.
   *
   * Con la lista posicional, cada dependencia nueva del servicio --y son mas de
   * veinte-- desplazaba todos los dobles y estas pruebas fallaban por un motivo
   * ajeno a lo que probaban. El registro y los dos relojes en memoria entran como
   * dobles porque `Object.create` no ejecuta los campos inicializados.
   */
  const service = Object.create(ServicesService.prototype) as ServicesService;
  Object.assign(service, {
    logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
    waitTimeouts: new Map(),
    dispatchTimeouts: new Map(),
    serviciosRepository,
    viajesRepository,
    choferesRepository,
    usuariosRepository,
    conversationsRepository: {},
    bankAccountsRepository: {},
    paymentReceiptValidationsRepository: {},
    realtimeEventsService: realtime,
    bot,
    telegramService: {},
    aiMessageService,
    loyaltyService: {},
    liquidationSync,
    configService: { get: jest.fn() },
    disciplineService: {},
    uploadService: {},
    // empleadas, clientes y sesiones: solo los usa el cierre por la empleada.
    empleadasRepository: {},
    clientesRepository: {},
    telegramSessionRepository: {},
    // catalogo de extras, extras cobrados y participantes: solo los usa
    // agregar un extra. Ninguna de las dos cosas se ejercita aqui.
    extrasCatalogoRepository: {},
    extrasServicioRepository: {},
    serviceParticipantsRepository: {},
  });

  const actor = { id: 'user-1', rol: 'admin' } as any;

  function servicioEnCurso() {
    return {
      id: 'svc-1',
      estado: 'en_curso',
      empleadaId: 'emp-1',
      jefeId: 'jefe-1',
      serviceType: 'individual',
      cliente: { telegramChatId: '555' },
      empleada: { nombreArtistico: 'Ana', usuarioId: 'user-emp' },
      viajes: [],
    };
  }

  beforeEach(() => jest.clearAllMocks());

  it('guarda motivo, nota, autor y momento de la cancelacion', async () => {
    const servicio = servicioEnCurso();
    serviciosRepository.findOne.mockResolvedValue(servicio);
    usuariosRepository.findOne.mockResolvedValue(null);

    await service.cancel('svc-1', actor, {
      reason: 'cliente_desistio',
      note: '  se arrepintio al llegar  ',
    });

    const guardado = serviciosRepository.save.mock.calls[0][0];
    expect(guardado.estado).toBe('cancelado');
    expect(guardado.motivoCancelacion).toBe('cliente_desistio');
    expect(guardado.notaCancelacion).toBe('se arrepintio al llegar');
    expect(guardado.canceladoPorUserId).toBe('user-1');
    expect(guardado.canceladoAt).toBeInstanceOf(Date);
  });

  it('deja la nota en nulo cuando llega vacia, en vez de guardar espacios', async () => {
    serviciosRepository.findOne.mockResolvedValue(servicioEnCurso());
    usuariosRepository.findOne.mockResolvedValue(null);

    await service.cancel('svc-1', actor, {
      reason: 'seguridad',
      note: '   ',
    });

    expect(
      serviciosRepository.save.mock.calls[0][0].notaCancelacion,
    ).toBeNull();
  });

  it('le avisa al cliente que ya no se va a poder', async () => {
    serviciosRepository.findOne.mockResolvedValue(servicioEnCurso());
    usuariosRepository.findOne.mockResolvedValue(null);

    await service.cancel('svc-1', actor, { reason: 'modelo_no_disponible' });

    expect(aiMessageService.generate).toHaveBeenCalledWith(
      'service_cancelled',
      { employeeName: 'Ana' },
      expect.stringContaining('Qué pena contigo'),
    );
    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
      '555',
      'Que pena contigo, no voy a poder ir',
    );
  });

  it('deja marcado el Uber ya despachado para que la oficina cierre su costo', async () => {
    const servicio = servicioEnCurso();
    servicio.viajes = [
      {
        id: 'trip-uber',
        estado: 'aceptado',
        proveedorTransporte: 'uber',
        fareConfirmedAt: null,
      },
    ] as any;
    serviciosRepository.findOne.mockResolvedValue(servicio);
    usuariosRepository.findOne.mockResolvedValue(null);

    await service.cancel('svc-1', actor, { reason: 'cliente_desistio' });

    expect(viajesRepository.update).toHaveBeenCalledWith(
      { id: expect.objectContaining({ _value: ['trip-uber'] }) },
      { canceladoConCosto: true },
    );
    expect(liquidationSync.syncCancelledRecord).toHaveBeenCalledWith('svc-1');
  });

  it('no marca costo en un Uber que nunca llego a despacharse', async () => {
    const servicio = servicioEnCurso();
    servicio.viajes = [
      {
        id: 'trip-uber',
        estado: 'notificado',
        proveedorTransporte: 'uber',
        fareConfirmedAt: null,
      },
    ] as any;
    serviciosRepository.findOne.mockResolvedValue(servicio);
    usuariosRepository.findOne.mockResolvedValue(null);

    await service.cancel('svc-1', actor, { reason: 'cliente_desistio' });

    expect(viajesRepository.update).not.toHaveBeenCalledWith(
      expect.anything(),
      { canceladoConCosto: true },
    );
  });

  it('permite completar despues el motivo de un servicio ya cancelado', async () => {
    serviciosRepository.findOne.mockResolvedValue({
      ...servicioEnCurso(),
      estado: 'cancelado',
    });

    await service.updateCancellationDetails('svc-1', actor, {
      reason: 'sin_transporte',
      note: '  no habia carro  ',
    });

    expect(serviciosRepository.update).toHaveBeenCalledWith('svc-1', {
      motivoCancelacion: 'sin_transporte',
      notaCancelacion: 'no habia carro',
    });
  });

  it('no deja poner motivo de cancelacion a un servicio que sigue vivo', async () => {
    serviciosRepository.findOne.mockResolvedValue(servicioEnCurso());

    await expect(
      service.updateCancellationDetails('svc-1', actor, { reason: 'otro' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(serviciosRepository.update).not.toHaveBeenCalled();
  });

  it('libera al chofer que ya tenia el viaje asignado', async () => {
    const servicio = servicioEnCurso();
    servicio.viajes = [
      { id: 'trip-1', estado: 'aceptado', choferId: 'chofer-1' },
    ] as any;
    serviciosRepository.findOne.mockResolvedValue(servicio);
    usuariosRepository.findOne.mockResolvedValue(null);
    choferesRepository.findOne.mockResolvedValue({
      id: 'chofer-1',
      usuario: { telegramChatId: '777' },
    });

    await service.cancel('svc-1', actor, { reason: 'cliente_desistio' });

    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
      '777',
      expect.stringContaining('queda sin efecto'),
    );
  });
});

/**
 * Cierre del costo del Uber que quedo pendiente al cancelar. Es lo que evita
 * que un traslado ya pagado desaparezca de los numeros de la semana.
 */
describe('ServicesService settleCancelledTripCost', () => {
  const viajesRepository = { update: jest.fn(), findOne: jest.fn() };
  const usuariosRepository = { findOne: jest.fn(), findOneBy: jest.fn() };
  const liquidationSync = {
    syncCancelledRecord: jest.fn().mockResolvedValue(null),
  };
  const bot = { telegram: { sendMessage: jest.fn() } };

  /*
   * Se construye por nombre y no con `new`.
   *
   * Con la lista posicional, cada dependencia nueva del servicio --y son mas de
   * veinte-- desplazaba todos los dobles y estas pruebas fallaban por un motivo
   * ajeno a lo que probaban. El registro y los dos relojes en memoria entran como
   * dobles porque `Object.create` no ejecuta los campos inicializados.
   */
  const service = Object.create(ServicesService.prototype) as ServicesService;
  Object.assign(service, {
    logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
    waitTimeouts: new Map(),
    dispatchTimeouts: new Map(),
    serviciosRepository: {},
    viajesRepository,
    choferesRepository: {},
    usuariosRepository,
    conversationsRepository: {},
    bankAccountsRepository: {},
    paymentReceiptValidationsRepository: {},
    realtimeEventsService: {},
    bot,
    telegramService: {},
    aiMessageService: {},
    loyaltyService: {},
    liquidationSync,
    configService: { get: jest.fn() },
    disciplineService: {},
    uploadService: {},
    // empleadas, clientes y sesiones: solo los usa el cierre por la empleada.
    empleadasRepository: {},
    clientesRepository: {},
    telegramSessionRepository: {},
    // catalogo de extras, extras cobrados y participantes: solo los usa
    // agregar un extra. Ninguna de las dos cosas se ejercita aqui.
    extrasCatalogoRepository: {},
    extrasServicioRepository: {},
    serviceParticipantsRepository: {},
  });

  function viajePendiente(overrides: Record<string, unknown> = {}) {
    return {
      id: 'trip-1',
      servicioId: 'svc-1',
      proveedorTransporte: 'uber',
      estado: 'cancelado',
      canceladoConCosto: true,
      fareConfirmedAt: null,
      uberScreenshotUrl: 'https://cdn/captura.jpg',
      telegramUberFileId: null,
      servicio: { jefeId: 'boss' },
      ...overrides,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    usuariosRepository.findOneBy.mockResolvedValue({
      id: 'boss',
      rol: 'jefe',
    });
  });

  it('registra la tarifa real y recalcula el corte', async () => {
    viajesRepository.findOne.mockResolvedValue(viajePendiente());

    await service.settleCancelledTripCost('trip-1', 'boss', 500);

    expect(viajesRepository.update).toHaveBeenCalledWith(
      'trip-1',
      expect.objectContaining({ tarifa: 500, fareConfirmedByUserId: 'boss' }),
    );
    expect(liquidationSync.syncCancelledRecord).toHaveBeenCalledWith('svc-1');
  });

  it('marca el costo como cobrado al cliente cuando la oficina lo decide', async () => {
    viajesRepository.findOne.mockResolvedValue(viajePendiente());

    const result = await service.settleCancelledTripCost(
      'trip-1',
      'boss',
      500,
      true,
    );

    expect(result.chargeToClient).toBe(true);
    expect(viajesRepository.update).toHaveBeenCalledWith(
      'trip-1',
      expect.objectContaining({ costoCobradoAlCliente: true }),
    );
  });

  it('no le cobra al cliente un viaje que no costo nada', async () => {
    viajesRepository.findOne.mockResolvedValue(
      viajePendiente({ uberScreenshotUrl: null }),
    );

    const result = await service.settleCancelledTripCost(
      'trip-1',
      'boss',
      0,
      true,
    );

    expect(result.chargeToClient).toBe(false);
    expect(viajesRepository.update).toHaveBeenCalledWith(
      'trip-1',
      expect.objectContaining({ costoCobradoAlCliente: false }),
    );
  });

  it('acepta un cero para declarar que el viaje nunca salio', async () => {
    viajesRepository.findOne.mockResolvedValue(
      viajePendiente({ uberScreenshotUrl: null }),
    );

    await service.settleCancelledTripCost('trip-1', 'boss', 0);

    expect(viajesRepository.update).toHaveBeenCalledWith(
      'trip-1',
      expect.objectContaining({ tarifa: 0, fareConfirmationOverride: false }),
    );
  });

  it('sin captura, un jefe no puede cargar un costo mayor que cero', async () => {
    viajesRepository.findOne.mockResolvedValue(
      viajePendiente({ uberScreenshotUrl: null }),
    );

    await expect(
      service.settleCancelledTripCost('trip-1', 'boss', 500),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(viajesRepository.update).not.toHaveBeenCalled();
  });

  it('rechaza cerrar dos veces el mismo viaje', async () => {
    viajesRepository.findOne.mockResolvedValue(
      viajePendiente({ fareConfirmedAt: new Date() }),
    );

    await expect(
      service.settleCancelledTripCost('trip-1', 'boss', 300),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rechaza un monto negativo', async () => {
    viajesRepository.findOne.mockResolvedValue(viajePendiente());

    await expect(
      service.settleCancelledTripCost('trip-1', 'boss', -10),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
