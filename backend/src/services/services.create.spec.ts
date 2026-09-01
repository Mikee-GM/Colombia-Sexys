import { ServicesService } from './services.service';

describe('ServicesService.create', () => {
  const serviciosRepository = {
    findOne: jest.fn(),
    manager: {} as any,
  };
  const disciplineService = {
    assertOperationallyAllowed: jest.fn().mockResolvedValue(undefined),
  };
  const realtime = { emitToBoss: jest.fn() };
  const telegramService = { notifyJefesNewService: jest.fn() };

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
    realtimeEventsService: realtime,
    bot: {},
    telegramService,
    aiMessageService: {},
    loyaltyService: {},
    liquidationSync: {},
    configService: {},
    disciplineService,
    uploadService: {},
    empleadasRepository: {},
    clientesRepository: {},
    telegramSessionRepository: {},
    extrasCatalogoRepository: {},
    extrasServicioRepository: {},
    serviceParticipantsRepository: {},
  });

  let manager: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    getRepository: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // El bloqueo pesimista de la fila de la empleada, al inicio de reserveNext.
    const employeeQueryBuilder = {
      createQueryBuilder: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOneOrFail: jest.fn().mockResolvedValue({ id: 'employee' }),
    };
    manager = {
      findOne: jest.fn().mockResolvedValue(null), // sin servicio en_curso previo
      find: jest.fn().mockResolvedValue([]), // sin solicitudes en competencia
      create: jest.fn((_entity, data) => data),
      save: jest.fn((_entity, data) => Promise.resolve(data)),
      getRepository: jest.fn().mockReturnValue(employeeQueryBuilder),
    };
    serviciosRepository.manager = {
      transaction: jest.fn((callback: any) => callback(manager)),
    };
  });

  /*
   * Un servicio del panel no viene de una conversacion con la IA. Sin fijar
   * esto en false, el puente que reenvia mensajes del cliente al tema del
   * jefe (que exige iaActiva === false) nunca los reenviaba: se perdian en
   * silencio porque la columna nace activada por defecto.
   */
  it('desactiva la IA por defecto en un servicio creado desde el panel', async () => {
    const resultado = await service.create({
      empleadaId: 'employee',
      jefeId: 'boss',
      clienteId: 'client',
    });

    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ iaActiva: false }),
    );
    expect(resultado.iaActiva).toBe(false);
  });

  it('respeta iaActiva si el llamador ya lo especifica', async () => {
    await service.create({
      empleadaId: 'employee',
      jefeId: 'boss',
      clienteId: 'client',
      iaActiva: true,
    });

    expect(manager.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ iaActiva: true }),
    );
  });
});
