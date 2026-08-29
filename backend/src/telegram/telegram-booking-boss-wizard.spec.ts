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
    update.servicesService = mockServicesService;
    update.serviciosRepository = mockServiciosRepo;
    update.bot = mockBot;
    update.transportOperations = {
      activeLocations: jest.fn().mockResolvedValue([]),
    };
    update.recordConversation = jest.fn().mockResolvedValue({});
    update.logger = { error: jest.fn(), warn: jest.fn(), log: jest.fn() };
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
        match: ['', 'none', 'emp-1', '3', 'tarjeta', 'external', 'programado'],
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
          tipoAgenda: 'programado',
        }),
      );
      expect(mockClientesRepo.findOne).not.toHaveBeenCalledWith(
        expect.objectContaining({ order: { createdAt: 'DESC' } }),
      );
    });
  });
});
