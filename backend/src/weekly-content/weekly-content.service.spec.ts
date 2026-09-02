import { WeeklyContentService } from './weekly-content.service';

/**
 * Lo que se protege aqui es el motivo del rechazo.
 *
 * Rechazar era un boton mudo: la modelo veia "No aprobada" en el portal y
 * volvia a mandar la misma clase de foto. Ahora el motivo se guarda con la
 * decision y sale por Telegram, asi que lo que no puede fallar es que el motivo
 * acompañe al rechazo, que una aprobacion posterior lo borre, y que un fallo
 * del bot no tumbe la revision, que ya esta decidida cuando se avisa.
 */
describe('WeeklyContentService.reviewSubmission', () => {
  const submissionRepo = { findOne: jest.fn(), save: jest.fn() };
  const scheduleRepo = {};
  const empleadasRepo = {};
  const fotosRepo = { find: jest.fn(), save: jest.fn(), create: jest.fn() };
  const fotosExclusivasRepo = {
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };
  const uploadService = {};
  const telegramService = { sendMessage: jest.fn() };
  const panelAccessService = { issueLink: jest.fn() };

  /*
   * Se construye por nombre y no con `new`.
   *
   * Con la lista posicional, cada dependencia nueva del servicio desplazaba todos
   * los dobles y estas pruebas fallaban por un motivo ajeno a lo que probaban.
   * Los campos inicializados de la clase entran como dobles porque
   * `Object.create` no los ejecuta.
   */
  const service = Object.create(
    WeeklyContentService.prototype,
  ) as WeeklyContentService;
  Object.assign(service, {
    logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
    submissionRepo,
    scheduleRepo,
    empleadasRepo,
    fotosRepo,
    fotosExclusivasRepo,
    uploadService,
    telegramService,
    panelAccessService,
  });

  const revisor = { id: 'user-admin' } as any;

  /** Envio pendiente de una modelo con chat vinculado. */
  const envio = (overrides: Record<string, unknown> = {}) => ({
    id: 'sub-1',
    empleadaId: 'emp-1',
    url: 'https://cdn.example.com/foto.jpg',
    estado: 'pendiente',
    motivoRechazo: null,
    empleada: {
      nombreArtistico: 'Modelo',
      usuario: { id: 'user-1', telegramChatId: '555' },
    },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Se reasigna en cada prueba y no solo al declararlo: clearAllMocks borra
    // las llamadas pero conserva la implementacion, asi que el rechazo que
    // simula el bot caido se arrastraria a las siguientes.
    telegramService.sendMessage.mockResolvedValue(undefined);
    submissionRepo.save.mockImplementation((valor) => valor);
    fotosRepo.find.mockResolvedValue([]);
    fotosRepo.create.mockImplementation((valor) => valor);
    panelAccessService.issueLink.mockResolvedValue({
      url: 'https://portal.example.com/acceso/abc',
    });
  });

  it('guarda el motivo y se lo manda a la modelo por Telegram', async () => {
    const pendiente = envio();
    submissionRepo.findOne.mockResolvedValue(pendiente);

    const resultado = await service.reviewSubmission(
      'sub-1',
      'rechazar',
      revisor,
      '  La foto esta movida.  ',
    );

    expect(resultado.estado).toBe('rechazada');
    expect(resultado.motivoRechazo).toBe('La foto esta movida.');

    const [chatId, texto] = telegramService.sendMessage.mock.calls[0];
    expect(chatId).toBe('555');
    expect(texto).toContain('La foto esta movida.');
  });

  it('avisa igual cuando se rechaza sin motivo', async () => {
    submissionRepo.findOne.mockResolvedValue(envio());

    const resultado = await service.reviewSubmission(
      'sub-1',
      'rechazar',
      revisor,
    );

    // Un motivo vacio no debe guardarse como cadena: el portal distingue
    // "sin motivo" por el nulo.
    expect(resultado.motivoRechazo).toBeNull();
    expect(telegramService.sendMessage).toHaveBeenCalledTimes(1);
  });

  /**
   * El motivo lo escribe una persona y viaja en un mensaje con formato
   * Markdown: un asterisco suelto hacia que Telegram devolviera 400 y el aviso
   * se perdiera entero.
   */
  it('quita del motivo las marcas que romperian el Markdown', async () => {
    submissionRepo.findOne.mockResolvedValue(envio());

    await service.reviewSubmission(
      'sub-1',
      'rechazar',
      revisor,
      'Se ve *raro* el _fondo_ [aqui]',
    );

    const [, texto] = telegramService.sendMessage.mock.calls[0];
    expect(texto).toContain('Se ve raro el fondo aqui');
  });

  it('no avisa a una modelo sin chat de Telegram vinculado', async () => {
    submissionRepo.findOne.mockResolvedValue(
      envio({ empleada: { nombreArtistico: 'Modelo', usuario: null } }),
    );

    const resultado = await service.reviewSubmission(
      'sub-1',
      'rechazar',
      revisor,
      'Falta luz.',
    );

    expect(resultado.motivoRechazo).toBe('Falta luz.');
    expect(telegramService.sendMessage).not.toHaveBeenCalled();
  });

  it('deja la revision guardada aunque falle el envio por Telegram', async () => {
    submissionRepo.findOne.mockResolvedValue(envio());
    telegramService.sendMessage.mockRejectedValue(new Error('bot caido'));

    await expect(
      service.reviewSubmission('sub-1', 'rechazar', revisor, 'Falta luz.'),
    ).resolves.toMatchObject({ estado: 'rechazada' });
  });

  it('borra el motivo anterior si la foto acaba aprobandose', async () => {
    submissionRepo.findOne.mockResolvedValue(
      envio({ estado: 'rechazada', motivoRechazo: 'La foto esta movida.' }),
    );

    const resultado = await service.reviewSubmission(
      'sub-1',
      'aprobar_publica',
      revisor,
    );

    expect(resultado.estado).toBe('aprobada_publica');
    expect(resultado.motivoRechazo).toBeNull();
    expect(telegramService.sendMessage).not.toHaveBeenCalled();
  });
});
