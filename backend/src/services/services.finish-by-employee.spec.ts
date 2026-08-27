import { ServicesService } from './services.service';

/**
 * Cierre de un servicio por la empleada.
 *
 * Esta logica vivia dentro del handler de Telegram y no tenia pruebas: era el
 * unico camino y se validaba a mano. Ahora la comparten el chat y el portal, y
 * lo que no puede fallar es el dinero -- el redondeo de las horas abiertas -- y
 * el estado en el que queda la operacion: quien cierra la liquidacion, cuando
 * se libera la modelo y cuando se pide el regreso.
 */
describe('ServicesService.finishByEmployee', () => {
  const EMPLEADA = 'emp-1';
  const USUARIO = 'user-1';

  let serviciosRepository: any;
  let empleadasRepository: any;
  let realtime: any;
  let bot: any;
  let botRegistry: any;
  let telegramSessionRepository: any;
  let extrasCatalogoRepository: any;
  let extrasServicioRepository: any;
  let service: ServicesService;
  let guardados: any[];
  /*
   * Los espias se guardan aparte: leerlos como `service.metodo` en un `expect`
   * separa el metodo de su objeto y eso es justo lo que prohibe unbound-method.
   */
  let pedirRegreso: jest.SpyInstance;
  let activarSiguiente: jest.SpyInstance;

  /**
   * Servicio en curso, con una hora de inicio conocida.
   *
   * Se tipa como `any` porque el cierre escribe encima campos que el literal no
   * declara, y son justamente esos campos --el estado de la liquidacion, las
   * horas finales-- los que las pruebas comprueban despues.
   */
  const enCurso = (overrides: Record<string, unknown> = {}): any => ({
    id: 'srv-1',
    estado: 'en_curso',
    serviceType: 'individual',
    empleadaId: EMPLEADA,
    duracionPactadaHoras: 2,
    duracionIndefinida: false,
    metodoPago: 'efectivo',
    totalFinal: 5000,
    totalBase: 5000,
    horaInicioServicio: new Date(Date.now() - 2 * 3_600_000),
    empleada: { usuarioId: USUARIO, nombreArtistico: 'Modelo' },
    cliente: { nombreTelegram: 'Cliente', telegramChatId: '999' },
    ...overrides,
  });

  beforeEach(() => {
    guardados = [];
    serviciosRepository = {
      findOne: jest.fn(),
      save: jest.fn((valor) => {
        guardados.push({ ...valor });
        return Promise.resolve(valor);
      }),
      update: jest.fn().mockResolvedValue(undefined),
      findOneBy: jest.fn().mockResolvedValue(null),
    };
    empleadasRepository = {
      update: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue({ nombreArtistico: 'Modelo' }),
    };
    realtime = { emitToJefes: jest.fn(), emitToBoss: jest.fn() };
    bot = { telegram: { sendMessage: jest.fn().mockResolvedValue(undefined) } };
    botRegistry = { botForEmployeeOrCentral: jest.fn(() => bot), central: bot };
    telegramSessionRepository = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn(),
    };
    extrasCatalogoRepository = { find: jest.fn(), findOne: jest.fn() };
    extrasServicioRepository = {
      create: jest.fn((v) => v),
      save: jest.fn().mockResolvedValue(undefined),
    };

    service = new ServicesService(
      serviciosRepository as any,
      { find: jest.fn().mockResolvedValue([]) } as any,
      {} as any,
      {} as any,
      { save: jest.fn(), create: jest.fn((v) => v) } as any,
      {} as any,
      {} as any,
      realtime as any,
      bot as any,
      {} as any,
      {} as any,
      {} as any,
      { syncOfficeRecord: jest.fn().mockResolvedValue(null) } as any,
      { get: jest.fn() } as any,
      {} as any,
      {} as any,
      botRegistry as any,
      empleadasRepository as any,
      { findOne: jest.fn().mockResolvedValue(null) } as any,
      telegramSessionRepository as any,
      extrasCatalogoRepository as any,
      extrasServicioRepository as any,
      { findOne: jest.fn().mockResolvedValue(null) } as any,
    );

    // Lo que ocurre despues del cierre se prueba por separado; aqui solo se
    // comprueba si se dispara y con que.
    activarSiguiente = jest
      .spyOn(service, 'activateScheduledSuccessor')
      .mockResolvedValue({ hasSuccessor: false, sameLocation: false });
    pedirRegreso = jest
      .spyOn(service, 'requestReturnTransport')
      .mockResolvedValue(undefined as never);
  });

  it('cierra el servicio, libera a la modelo y pide el regreso', async () => {
    const servicio = enCurso();
    serviciosRepository.findOne.mockResolvedValue(servicio);

    const resultado = await service.finishByEmployee('srv-1', USUARIO);

    expect(servicio.estado).toBe('finalizado');
    expect(servicio.horaFinServicio).toBeInstanceOf(Date);
    expect(empleadasRepository.update).toHaveBeenCalledWith(EMPLEADA, {
      disponible: true,
    });
    expect(pedirRegreso).toHaveBeenCalledWith('srv-1');
    expect(realtime.emitToJefes).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'employee_availability_updated' }),
    );
    expect(resultado.horasFacturadas).toBeNull();
    expect(resultado.duracionFormatted).toContain('hora');
  });

  it('deja el corte abierto a la espera del transporte de regreso', async () => {
    const servicio = enCurso();
    serviciosRepository.findOne.mockResolvedValue(servicio);

    await service.finishByEmployee('srv-1', USUARIO);

    expect(servicio.estadoLiquidacion).toBe('transporte_pendiente');
    expect(servicio.proximoRecordatorioRegresoAt).toBeInstanceOf(Date);
  });

  it('cierra la liquidacion y no pide regreso si hay servicio encadenado', async () => {
    const servicio = enCurso();
    serviciosRepository.findOne.mockResolvedValue(servicio);
    activarSiguiente.mockResolvedValue({
      hasSuccessor: true,
      sameLocation: true,
    });

    const resultado = await service.finishByEmployee('srv-1', USUARIO);

    expect(servicio.estadoLiquidacion).toBe('cerrada');
    expect(servicio.proximoRecordatorioRegresoAt).toBeNull();
    expect(pedirRegreso).not.toHaveBeenCalled();
    // Sigue ocupada: entra directa al siguiente servicio.
    expect(empleadasRepository.update).not.toHaveBeenCalled();
    expect(resultado.hasSuccessor).toBe(true);
  });

  it('redondea hacia arriba las horas de una duracion abierta', async () => {
    // 2h 20m se cobran como 3 horas: el corte es a los 15 minutos.
    const servicio = enCurso({
      duracionIndefinida: true,
      horaInicioServicio: new Date(Date.now() - (2 * 3_600_000 + 20 * 60_000)),
    });
    serviciosRepository.findOne.mockResolvedValue(servicio);

    const resultado = await service.finishByEmployee('srv-1', USUARIO);

    expect(resultado.horasFacturadas).toBe(3);
    // Se escribe en la duracion pactada porque el total lo recalcula el trigger.
    expect(servicio.duracionPactadaHoras).toBe(3);
    expect(servicio.duracionFinalHoras).toBe(3);
  });

  it('no redondea una duracion pactada', async () => {
    const servicio = enCurso({
      horaInicioServicio: new Date(Date.now() - (2 * 3_600_000 + 20 * 60_000)),
    });
    serviciosRepository.findOne.mockResolvedValue(servicio);

    await service.finishByEmployee('srv-1', USUARIO);

    expect(servicio.duracionPactadaHoras).toBe(2);
    expect(servicio.duracionFinalHoras).toBeCloseTo(2.33, 1);
  });

  it('le cobra al cliente la cuenta final de un servicio abierto', async () => {
    const servicio = enCurso({
      duracionIndefinida: true,
      metodoPago: 'transferencia',
    });
    serviciosRepository.findOne.mockResolvedValue(servicio);
    jest
      .spyOn(service, 'bankTransferDetails')
      .mockResolvedValue('Banco de prueba');

    await service.finishByEmployee('srv-1', USUARIO);

    const [chatId, mensaje] = bot.telegram.sendMessage.mock.calls[0];
    expect(chatId).toBe('999');
    expect(mensaje).toContain('Cuenta final del servicio');
    expect(mensaje).toContain('Banco de prueba');
    expect(serviciosRepository.update).toHaveBeenCalledWith('srv-1', {
      cobroFinalPendiente: true,
    });
  });

  it('no le cobra por adelantado a un servicio de duracion pactada', async () => {
    serviciosRepository.findOne.mockResolvedValue(enCurso());

    await service.finishByEmployee('srv-1', USUARIO);

    expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
  });

  it('avisa a los clientes que se quedaron esperando a la modelo', async () => {
    serviciosRepository.findOne.mockResolvedValue(enCurso());
    telegramSessionRepository.find.mockResolvedValue([
      { key: '777:abc', data: { esperandoEmpleadaId: EMPLEADA } },
    ]);

    await service.finishByEmployee('srv-1', USUARIO);

    const [chatId] = bot.telegram.sendMessage.mock.calls[0];
    expect(chatId).toBe('777');
    expect(telegramSessionRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ esperandoEmpleadaId: undefined }),
      }),
    );
  });

  it('rechaza a quien no es la empleada asignada', async () => {
    serviciosRepository.findOne.mockResolvedValue(enCurso());

    await expect(
      service.finishByEmployee('srv-1', 'otro-usuario'),
    ).rejects.toThrow('No puedes finalizar este servicio');
    expect(serviciosRepository.save).not.toHaveBeenCalled();
  });

  it('rechaza un servicio que ya no esta en curso', async () => {
    serviciosRepository.findOne.mockResolvedValue(
      enCurso({ estado: 'finalizado' }),
    );

    await expect(service.finishByEmployee('srv-1', USUARIO)).rejects.toThrow(
      'ya no está activo',
    );
  });

  it('manda un servicio grupal a su propio flujo', async () => {
    // Lo cierra la responsable con GroupServicesService, que reparte entre
    // participantes; cerrarlo por aqui se saltaria ese reparto.
    serviciosRepository.findOne.mockResolvedValue(
      enCurso({ serviceType: 'grupal' }),
    );

    await expect(service.finishByEmployee('srv-1', USUARIO)).rejects.toThrow(
      'responsable',
    );
  });

  it('no tumba el cierre si falla el aviso del regreso', async () => {
    serviciosRepository.findOne.mockResolvedValue(enCurso());
    pedirRegreso.mockRejectedValue(new Error('Telegram caido'));

    const resultado = await service.finishByEmployee('srv-1', USUARIO);

    expect(resultado.servicio).toBeDefined();
  });
});
