import { TelegramBookingUpdate } from './telegram-booking.update';

describe('TelegramBookingUpdate - Asistente de Creación Manual del Jefe', () => {
  let update: any;
  let mockEmpleadasRepo: any;
  let mockClientesRepo: any;
  let mockServicesService: any;
  let mockServiciosRepo: any;
  let mockBot: any;

  beforeEach(() => {
    update = Object.create(TelegramBookingUpdate.prototype);
    mockEmpleadasRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };
    mockClientesRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
    };
    mockServicesService = {
      create: jest.fn(),
    };
    mockServiciosRepo = {
      save: jest.fn(),
    };
    mockBot = {
      telegram: {
        sendMessage: jest.fn().mockResolvedValue({}),
      },
    };

    update.empleadasRepository = mockEmpleadasRepo;
    update.clientesRepository = mockClientesRepo;
    update.usuariosRepository = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'jefe-1',
          activo: true,
          disponible: true,
          enJornada: true,
        },
      ]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    update.servicesService = mockServicesService;
    update.serviciosRepository = mockServiciosRepo;
    update.bot = mockBot;
    update.transportOperations = {
      activeLocations: jest.fn().mockResolvedValue([]),
    };
    update.recordConversation = jest.fn().mockResolvedValue({});
    update.logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
    // `onMessage` cede el texto a estos dos antes de mirar sus propios pasos.
    update.manualServiceWizard = {
      manejarTexto: jest.fn().mockResolvedValue(false),
    };
    update.teamChannelUpdate = {
      manejarTexto: jest.fn().mockResolvedValue(false),
    };
    update.clienteBloqueado = jest.fn().mockResolvedValue(false);
  });

  describe('onBossMsConfirm', () => {
    const empleadaMock = {
      id: 'emp-1',
      nombreArtistico: 'Valentina',
      precioBaseHora: 1500,
      jefeId: 'jefe-1',
    };

    it('crea el servicio con cliente registrado cuando se especifica clientId', async () => {
      const clienteMock = {
        id: 'cli-1',
        nombreTelegram: 'Carlos',
        telegramChatId: '123456789',
      };
      mockEmpleadasRepo.findOne.mockResolvedValue(empleadaMock);
      mockClientesRepo.findOne.mockResolvedValue(clienteMock);
      mockServicesService.create.mockResolvedValue({
        id: 'srv-uuid-1',
        clienteId: 'cli-1',
      });

      const ctx: any = {
        callbackQuery: { message: { message_thread_id: 100 } },
        match: ['', 'cli-1', 'emp-1', '2', 'efectivo', 'external', 'inmediato'],
        answerCbQuery: jest.fn().mockResolvedValue(true),
        editMessageText: jest.fn().mockResolvedValue(true),
        reply: jest.fn().mockResolvedValue(true),
        session: {},
      };

      await update.onBossMsConfirm(ctx);

      expect(mockServicesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          empleadaId: 'emp-1',
          clienteId: 'cli-1',
          duracionPactadaHoras: 2,
          metodoPago: 'efectivo',
          clienteTelegramId: '123456789',
        }),
      );
      expect(mockBot.telegram.sendMessage).toHaveBeenCalledWith(
        '123456789',
        expect.stringContaining('Valentina'),
        expect.any(Object),
      );
    });

    it('crea el servicio con nombre libre y clienteId nulo cuando no está registrado', async () => {
      mockEmpleadasRepo.findOne.mockResolvedValue(empleadaMock);
      mockClientesRepo.findOne.mockResolvedValue(null);
      mockServicesService.create.mockResolvedValue({
        id: 'srv-uuid-2',
        clienteId: null,
      });

      const ctx: any = {
        callbackQuery: { message: {} },
        match: [
          '',
          'none',
          'emp-1',
          '1',
          'transferencia',
          'external',
          'inmediato',
        ],
        answerCbQuery: jest.fn().mockResolvedValue(true),
        editMessageText: jest.fn().mockResolvedValue(true),
        reply: jest.fn().mockResolvedValue(true),
        session: {
          bossManualService: {
            clienteNombreLibre: 'Pedro Pérez',
          },
        },
      };

      await update.onBossMsConfirm(ctx);

      expect(mockServicesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          empleadaId: 'emp-1',
          clienteId: undefined,
          clienteNombreLibre: 'Pedro Pérez',
          duracionPactadaHoras: 1,
          metodoPago: 'transferencia',
        }),
      );
      // No debe intentar buscar el "último cliente registrado"
      expect(mockClientesRepo.findOne).not.toHaveBeenCalledWith(
        expect.objectContaining({ order: { createdAt: 'DESC' } }),
      );
      // No debe mandar mensaje privado si no hay telegramChatId
      expect(mockBot.telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('crea el servicio como anónimo / sin cliente sin asociarlo a nadie ajeno', async () => {
      mockEmpleadasRepo.findOne.mockResolvedValue(empleadaMock);
      mockClientesRepo.findOne.mockResolvedValue(null);
      mockServicesService.create.mockResolvedValue({
        id: 'srv-uuid-3',
        clienteId: null,
      });

      const ctx: any = {
        callbackQuery: { message: {} },
        match: ['', 'none', 'emp-1', '3', 'tarjeta', 'external', 'inmediato'],
        answerCbQuery: jest.fn().mockResolvedValue(true),
        editMessageText: jest.fn().mockResolvedValue(true),
        reply: jest.fn().mockResolvedValue(true),
        session: {},
      };

      await update.onBossMsConfirm(ctx);

      expect(mockServicesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          empleadaId: 'emp-1',
          clienteId: undefined,
          clienteNombreLibre: undefined,
          duracionPactadaHoras: 3,
          metodoPago: 'tarjeta',
          tipoAgenda: 'inmediato',
        }),
      );
      expect(mockClientesRepo.findOne).not.toHaveBeenCalledWith(
        expect.objectContaining({ order: { createdAt: 'DESC' } }),
      );
    });
  });

  /**
   * Antes esta rama no preguntaba nada: el servicio nacia con una hora de
   * marcador --siempre una hora a partir de ese momento-- y no habia forma de
   * corregirla desde el bot.
   */
  describe('cita programada: el jefe escribe la hora', () => {
    const empleadaMock = {
      id: 'emp-1',
      nombreArtistico: 'Valentina',
      precioBaseHora: 1500,
      jefeId: 'jefe-1',
    };

    function ctxDeBoton(): any {
      return {
        callbackQuery: { message: { message_thread_id: 100 } },
        match: ['', 'cli-1', 'emp-1', '4', 'transferencia', 'external'],
        answerCbQuery: jest.fn().mockResolvedValue(true),
        editMessageText: jest.fn().mockResolvedValue(true),
        reply: jest.fn().mockResolvedValue(true),
        session: {},
      };
    }

    function ctxDeTexto(texto: string, session: any): any {
      return {
        from: { id: 55 },
        chat: { type: 'private' },
        message: { text: texto },
        reply: jest.fn().mockResolvedValue(true),
        editMessageText: jest.fn().mockResolvedValue(true),
        answerCbQuery: jest.fn().mockResolvedValue(true),
        session,
      };
    }

    it('pide la hora y todavia no crea nada', async () => {
      const ctx = ctxDeBoton();

      await update.onBossMsSchedule(ctx);

      expect(mockServicesService.create).not.toHaveBeenCalled();
      expect(ctx.session.step).toBe('BOSS_AWAITING_SCHEDULE_DATE');
      expect(ctx.session.bossManualService.citaPendiente).toMatchObject({
        clientId: 'cli-1',
        empleadaId: 'emp-1',
        duracion: 4,
        metodoPago: 'transferencia',
        threadId: 100,
      });
    });

    /*
     * Los botones "+1 hora" que quedaron en conversaciones viejas se siguen
     * pudiendo pulsar. No pueden quedarse mudos ni crear un servicio inmediato
     * que nadie pidio.
     */
    it('manda a la pregunta un boton viejo de "programado"', async () => {
      const ctx = ctxDeBoton();
      ctx.match = [
        '',
        'cli-1',
        'emp-1',
        '4',
        'transferencia',
        'external',
        'programado',
      ];

      await update.onBossMsConfirm(ctx);

      expect(mockServicesService.create).not.toHaveBeenCalled();
      expect(ctx.session.step).toBe('BOSS_AWAITING_SCHEDULE_DATE');
    });

    it('crea la cita con la hora que escribio el jefe', async () => {
      mockEmpleadasRepo.findOne.mockResolvedValue(empleadaMock);
      mockClientesRepo.findOne.mockResolvedValue({
        id: 'cli-1',
        nombreTelegram: 'Carlos',
        telegramChatId: '123456789',
      });
      mockServicesService.create.mockResolvedValue({ id: 'srv-9' });

      const desdeBoton = ctxDeBoton();
      await update.onBossMsSchedule(desdeBoton);

      const ctx = ctxDeTexto('mañana 14:00', desdeBoton.session);
      await update.onMessage(ctx, jest.fn());

      expect(mockServicesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          empleadaId: 'emp-1',
          duracionPactadaHoras: 4,
          tipoAgenda: 'programado',
          fechaProgramada: expect.any(Date),
        }),
      );

      const creado = mockServicesService.create.mock.calls[0][0];
      expect(creado.fechaProgramada.getTime()).toBeGreaterThan(Date.now());
      expect(
        creado.fechaProgramada.toLocaleString('es-MX', {
          timeZone: 'America/Mexico_City',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }),
      ).toBe('14:00');
    });

    /*
     * Adivinar una hora manda a la modelo al motel el dia que no es. Se vuelve
     * a preguntar, y la conversacion no se queda sin salida: sigue esperando.
     */
    it('vuelve a preguntar si no entiende la hora, sin crear nada', async () => {
      const desdeBoton = ctxDeBoton();
      await update.onBossMsSchedule(desdeBoton);

      const ctx = ctxDeTexto('cuando pueda', desdeBoton.session);
      await update.onMessage(ctx, jest.fn());

      expect(mockServicesService.create).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.stringContaining('No entendí esa hora'),
        expect.anything(),
      );
      expect(ctx.session.step).toBe('BOSS_AWAITING_SCHEDULE_DATE');
    });

    it('deja salir con /cancelar', async () => {
      const desdeBoton = ctxDeBoton();
      await update.onBossMsSchedule(desdeBoton);

      const ctx = ctxDeTexto('/cancelar', desdeBoton.session);
      await update.onMessage(ctx, jest.fn());

      expect(mockServicesService.create).not.toHaveBeenCalled();
      expect(ctx.session.step).toBeUndefined();
      expect(ctx.session.bossManualService).toBeUndefined();
    });
  });
});
