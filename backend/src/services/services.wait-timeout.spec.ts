import { ServicesService } from './services.service';

describe('ServicesService plazo de espera de la empleada', () => {
  const serviciosRepository = {
    update: jest.fn().mockResolvedValue(undefined),
    find: jest.fn(),
    findOne: jest.fn(),
  };

  /*
   * Se construye por nombre y no con `new`.
   *
   * Con la lista posicional, cada dependencia nueva del servicio --y son mas de
   * veinte-- desplazaba todos los dobles y estas pruebas fallaban por un motivo
   * ajeno a lo que probaban. El registro entra como doble porque `Object.create`
   * no ejecuta los campos inicializados de la clase.
   */
  const service = Object.create(ServicesService.prototype) as ServicesService;
  Object.assign(service, {
    logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
    // Los dos relojes en memoria del servicio: son campos
    // inicializados de la clase, y `Object.create` no los ejecuta.
    waitTimeouts: new Map(),
    dispatchTimeouts: new Map(),
    serviciosRepository,
    viajesRepository: {},
    choferesRepository: {},
    usuariosRepository: {},
    conversationsRepository: {},
    bankAccountsRepository: {},
    paymentReceiptValidationsRepository: {},
    realtimeEventsService: {},
    bot: {},
    telegramService: {},
    aiMessageService: {},
    loyaltyService: {},
    liquidationSync: {},
    configService: {},
    disciplineService: {},
    uploadService: {},
    empleadasRepository: {},
    clientesRepository: {},
    telegramSessionRepository: {},
    extrasCatalogoRepository: {},
    extrasServicioRepository: {},
    serviceParticipantsRepository: {},
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /*
   * Antes el plazo solo vivia en un setTimeout de Node: un despliegue a
   * mitad de la espera lo perdia sin cancelar el servicio, y con mas de una
   * replica el temporizador solo existia en la que lo inicio. Guardar el
   * vencimiento en la fila permite que sweepExpiredWaits lo encuentre aunque
   * el proceso original ya no exista.
   */
  it('persiste el vencimiento del plazo al iniciarlo', () => {
    service.startWaitTimeout('service-1', 600000);
    service.clearWaitTimeout('service-1'); // limpia el setTimeout real del test

    expect(serviciosRepository.update).toHaveBeenCalledWith('service-1', {
      esperaExpiraAt: expect.any(Date),
    });
  });

  it('limpia el vencimiento persistido al cancelar la espera', () => {
    service.startWaitTimeout('service-1', 600000);
    service.clearWaitTimeout('service-1');

    expect(serviciosRepository.update).toHaveBeenCalledWith('service-1', {
      esperaExpiraAt: null,
    });
  });

  it('barre y resuelve los servicios con plazo de espera vencido', async () => {
    serviciosRepository.find.mockResolvedValue([
      { id: 'srv-1' },
      { id: 'srv-2' },
    ]);
    const handleSpy = jest
      .spyOn(service, 'handleWaitTimeoutExpired')
      .mockResolvedValue();

    await service.sweepExpiredWaits();

    expect(serviciosRepository.find).toHaveBeenCalledWith({
      where: { estado: 'en_curso', esperaExpiraAt: expect.anything() },
      select: { id: true },
    });
    expect(handleSpy).toHaveBeenCalledWith('srv-1');
    expect(handleSpy).toHaveBeenCalledWith('srv-2');

    handleSpy.mockRestore();
  });

  it('un servicio en la barrida no detiene a los demas si uno falla', async () => {
    serviciosRepository.find.mockResolvedValue([
      { id: 'srv-1' },
      { id: 'srv-2' },
    ]);
    const handleSpy = jest
      .spyOn(service, 'handleWaitTimeoutExpired')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);

    await expect(service.sweepExpiredWaits()).resolves.toBeUndefined();

    expect(handleSpy).toHaveBeenCalledTimes(2);

    handleSpy.mockRestore();
  });
});
