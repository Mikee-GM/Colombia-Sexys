import { ServicesService } from './services.service';

describe('flujo de aceptación de la empleada', () => {
  const now = new Date('2026-10-05T12:00:00.000Z');

  const pendingService = (overrides: Record<string, unknown> = {}): any => ({
    id: 'service-1',
    estado: 'pendiente',
    operationalState: 'preparacion',
    serviceType: 'individual',
    empleadaId: 'employee-1',
    jefeId: 'boss-1',
    clienteId: 'client-1',
    transporteAgendado: 'chofer',
    empleada: {
      usuarioId: 'employee-user-1',
      usuario: { id: 'employee-user-1', telegramChatId: null },
    },
    ...overrides,
  });

  function setup(serviceRow = pendingService()) {
    const execute = jest.fn().mockResolvedValue({ affected: 1 });
    const repository = {
      findOne: jest.fn().mockResolvedValue(serviceRow),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute,
      })),
    };
    const transitionMany = jest
      .fn()
      .mockImplementation((_id, _actions, _actor, options) =>
        Promise.resolve({
          ...serviceRow,
          ...options.patch,
          operationalState: 'esperando_aceptacion_empleada',
        }),
      );
    const transition = jest.fn().mockResolvedValue(serviceRow);
    const recordEvent = jest.fn().mockResolvedValue(undefined);
    const notificationsService = {
      notificar: jest.fn().mockResolvedValue(1),
    };
    const disciplineService = {
      assertOperationallyAllowed: jest.fn().mockResolvedValue(undefined),
    };
    const bot = {
      telegram: { sendMessage: jest.fn().mockResolvedValue(undefined) },
    };
    const service = Object.create(ServicesService.prototype) as ServicesService;
    Object.assign(service, {
      logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      serviciosRepository: repository,
      usuariosRepository: {
        findOne: jest.fn().mockResolvedValue({ id: 'boss-1', rol: 'jefe' }),
      },
      disciplineService,
      serviceOperations: {
        currentState: jest.fn((row) => row.operationalState),
        transitionMany,
        transition,
        recordEvent,
      },
      realtimeEventsService: {
        emitToBoss: jest.fn(),
        emitToEmployee: jest.fn(),
        emitToClient: jest.fn(),
      },
      notificationsService,
      bot,
      assertActorCanManageService: jest.fn(),
    });
    return {
      service,
      repository,
      transitionMany,
      transition,
      recordEvent,
      execute,
      notificationsService,
      disciplineService,
      bot,
    };
  }

  beforeEach(() => jest.useFakeTimers().setSystemTime(now));
  afterEach(() => jest.useRealTimers());

  it('abre 15 minutos sin activar transporte ni marcar el servicio en curso', async () => {
    const { service, transitionMany } = setup();

    const result = await service.ofrecerAEmpleada(
      'service-1',
      'boss-1',
      'uber',
      'Piso 3',
    );

    expect(result.estado).toBe('pendiente');
    expect(transitionMany).toHaveBeenCalledWith(
      'service-1',
      ['preparar', 'asignar', 'solicitar_aceptacion_empleada'],
      { userId: 'boss-1', type: 'jefe' },
      expect.objectContaining({
        patch: expect.objectContaining({
          transporteAgendado: 'uber',
          employeeAcceptanceExpiresAt: new Date('2026-10-05T12:15:00.000Z'),
        }),
      }),
    );
  });

  it('es idempotente mientras ya espera respuesta', async () => {
    const row = pendingService({
      operationalState: 'esperando_aceptacion_empleada',
    });
    const { service, transitionMany } = setup(row);

    await expect(service.ofrecerAEmpleada('service-1', 'boss-1')).resolves.toBe(
      row,
    );
    expect(transitionMany).not.toHaveBeenCalled();
  });

  it('acepta desde el portal y solo entonces activa el flujo heredado', async () => {
    const row = pendingService({
      operationalState: 'esperando_aceptacion_empleada',
      employeeAcceptanceExpiresAt: new Date('2026-10-05T12:15:00.000Z'),
    });
    const { service, transitionMany } = setup(row);
    const activate = jest.fn().mockResolvedValue({
      ...row,
      estado: 'en_curso',
      viajeId: 'trip-1',
    });
    Object.assign(service, { aceptar: activate });

    await service.acceptByEmployee('service-1', 'employee-user-1');

    expect(activate).toHaveBeenCalledWith(
      'service-1',
      'boss-1',
      'chofer',
      undefined,
      undefined,
    );
    expect(transitionMany).toHaveBeenCalledWith(
      'service-1',
      ['aceptar_empleada', 'esperar_transporte_ida'],
      { userId: 'employee-user-1', type: 'empleada' },
      expect.objectContaining({
        patch: expect.objectContaining({
          employeeAcceptanceExpiresAt: null,
          estado: 'pendiente',
          horaInicioServicio: null,
        }),
      }),
    );
  });

  it('rechaza la aceptación de otra empleada', async () => {
    const row = pendingService({
      operationalState: 'esperando_aceptacion_empleada',
    });
    const { service } = setup(row);

    await expect(
      service.acceptByEmployee('service-1', 'other-user'),
    ).rejects.toThrow('Este servicio no es tuyo');
  });

  it('no acepta después de vencer también la ventana extra', async () => {
    const row = pendingService({
      operationalState: 'esperando_aceptacion_empleada',
      employeeAcceptanceRemindedAt: new Date('2026-10-05T11:54:00.000Z'),
      employeeAcceptanceExpiresAt: new Date('2026-10-05T11:59:59.000Z'),
    });
    const { service } = setup(row);

    await expect(
      service.acceptByEmployee('service-1', 'employee-user-1'),
    ).rejects.toThrow('La ventana de aceptación venció');
  });

  it('registra el rechazo sin ejecutar sanciones financieras o disciplinarias', async () => {
    const row = pendingService({
      operationalState: 'esperando_aceptacion_empleada',
    });
    const { service, transition } = setup(row);

    await service.rejectByEmployee('service-1', 'employee-user-1');

    expect(transition).toHaveBeenCalledWith(
      'service-1',
      'rechazar_empleada',
      { userId: 'employee-user-1', type: 'empleada' },
      expect.objectContaining({
        eventType: 'EMPLOYEE_REJECTED_SERVICE',
        patch: expect.objectContaining({
          estado: 'cancelado',
          motivoCancelacion: 'modelo_no_disponible',
        }),
      }),
    );
  });

  it('al minuto 15 recuerda y abre exactamente 6 minutos adicionales', async () => {
    const row = pendingService({
      operationalState: 'esperando_aceptacion_empleada',
      employeeAcceptanceExpiresAt: new Date('2026-10-05T12:00:00.000Z'),
    });
    const { service, repository, recordEvent, notificationsService } =
      setup(row);
    repository.find.mockResolvedValue([row]);

    await service.sweepEmployeeAcceptanceDeadlines(now);

    expect(recordEvent).toHaveBeenCalledWith(
      'service-1',
      'EMPLOYEE_ACCEPTANCE_REMINDER',
      { type: 'system' },
      { nextDeadline: '2026-10-05T12:06:00.000Z' },
    );
    expect(notificationsService.notificar).toHaveBeenCalledWith(
      'employee-user-1',
      expect.objectContaining({ requireInteraction: true }),
    );
  });

  it('al vencer la gracia escala al jefe sin sancionar automáticamente', async () => {
    const row = pendingService({
      operationalState: 'esperando_aceptacion_empleada',
      employeeAcceptanceRemindedAt: new Date('2026-10-05T11:54:00.000Z'),
      employeeAcceptanceExpiresAt: new Date('2026-10-05T12:00:00.000Z'),
    });
    const { service, repository, transition, disciplineService } = setup(row);
    repository.find.mockResolvedValue([row]);

    await service.sweepEmployeeAcceptanceDeadlines(now);

    expect(transition).toHaveBeenCalledWith(
      'service-1',
      'expirar',
      { type: 'system' },
      expect.objectContaining({ eventType: 'EMPLOYEE_ACCEPTANCE_ESCALATED' }),
    );
    expect(disciplineService.assertOperationallyAllowed).not.toHaveBeenCalled();
  });

  it('emite una sola vez SERVICE_ENDING_SOON dentro de la ventana de 15 minutos', async () => {
    const row = pendingService({
      estado: 'en_curso',
      operationalState: 'en_curso',
      horaInicioServicio: new Date('2026-10-05T10:14:00.000Z'),
      duracionPactadaHoras: 2,
      endingSoonNotifiedAt: null,
      cliente: { telegramChatId: 'client-chat' },
    });
    const { service, repository, recordEvent, bot } = setup(row);
    repository.find.mockResolvedValue([row]);

    await service.sweepServicesEndingSoon(now);

    expect(recordEvent).toHaveBeenCalledWith(
      'service-1',
      'SERVICE_ENDING_SOON',
      { type: 'system' },
      { expectedEndAt: '2026-10-05T12:14:00.000Z' },
    );
    expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
      'client-chat',
      expect.stringContaining('15 minutos'),
    );
  });
});
