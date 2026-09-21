import { BadRequestException, ConflictException } from '@nestjs/common';
import { ServicesService } from './services.service';

/**
 * Mover una cita de hora y de sitio.
 *
 * Nace de una cita que se agendo a las 8 de la manana cuando el chat decia las
 * 2 de la tarde: sin esto, la unica salida era cancelar el servicio y rehacerlo,
 * perdiendo el hilo con el cliente y el historial de la modelo.
 */
describe('ServicesService reprogramar y cambiarUbicacion', () => {
  const EN_TRES_HORAS = new Date(Date.now() + 3 * 60 * 60_000);

  let servicioGuardado: any;

  const serviciosRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
    save: jest.fn((value: unknown) => value),
    manager: { find: jest.fn().mockResolvedValue([]) },
  };
  const realtime = { emitToBoss: jest.fn(), emitToDriver: jest.fn() };
  const bot = { telegram: { sendMessage: jest.fn() } };
  const notificationsService = { notificar: jest.fn().mockResolvedValue(1) };
  const transportOperations = {
    activeLocations: jest.fn(),
    externalLocationFee: jest.fn().mockResolvedValue(150),
    coverageArea: jest.fn().mockResolvedValue({
      ciudad: 'Querétaro',
      centroLat: 20.5888,
      centroLng: -100.3899,
      radioKm: 25,
    }),
  };

  /*
   * Se construye por nombre, igual que en el resto de las pruebas del servicio:
   * con la lista posicional, cada dependencia nueva desplaza todos los dobles.
   */
  const service = Object.create(ServicesService.prototype) as ServicesService;
  Object.assign(service, {
    logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
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
    bot,
    telegramService: {},
    extensionsService: {},
    aiMessageService: {},
    loyaltyService: {},
    liquidationSync: {},
    configService: { get: jest.fn() },
    disciplineService: {},
    uploadService: {},
    empleadasRepository: {},
    clientesRepository: {},
    telegramSessionRepository: {},
    extrasCatalogoRepository: {},
    extrasServicioRepository: {},
    serviceParticipantsRepository: {},
    notificationsService,
    transportOperations,
  });

  const actor = { id: 'user-1', rol: 'admin' } as any;

  function citaAgendada(extra: Record<string, unknown> = {}) {
    return {
      id: 'svc-1',
      estado: 'agendado',
      empleadaId: 'emp-1',
      jefeId: 'jefe-1',
      duracionPactadaHoras: 4,
      tipoAgenda: 'programado',
      fechaProgramada: new Date(Date.now() + 24 * 60 * 60_000),
      ubicacionClienteLat: 20.5888,
      ubicacionClienteLng: -100.3899,
      presetLocationId: null,
      locationNameSnapshot: null,
      locationAddressSnapshot: 'Una dirección vieja',
      customerTransportCharge: 0,
      cliente: { telegramChatId: '555' },
      empleada: { usuarioId: 'user-emp', nombreArtistico: 'Lauren' },
      ...extra,
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    servicioGuardado = citaAgendada();
    serviciosRepository.findOne.mockImplementation(() =>
      Promise.resolve(servicioGuardado),
    );
    serviciosRepository.update.mockImplementation(
      (_id: string, cambios: Record<string, unknown>) => {
        servicioGuardado = { ...servicioGuardado, ...cambios };
        return Promise.resolve({ affected: 1 });
      },
    );
    serviciosRepository.manager.find.mockResolvedValue([]);
    transportOperations.externalLocationFee.mockResolvedValue(150);
  });

  describe('reprogramar', () => {
    it('guarda la hora nueva y mantiene horaInicioEstimada en paralelo', async () => {
      await service.reprogramar('svc-1', EN_TRES_HORAS, actor, false);

      expect(serviciosRepository.update).toHaveBeenCalledWith(
        'svc-1',
        expect.objectContaining({
          fechaProgramada: EN_TRES_HORAS,
          horaInicioEstimada: EN_TRES_HORAS,
          tipoAgenda: 'programado',
        }),
      );
    });

    /*
     * El recordatorio de 45 minutos se manda una sola vez. Si ya habia salido
     * con la hora vieja y no se reinicia la marca, nadie vuelve a avisar de la
     * nueva y la modelo se entera cuando ya es tarde.
     */
    it('reinicia el aviso previo para que vuelva a salir con la hora nueva', async () => {
      servicioGuardado = citaAgendada({ notificacionPreviaEnviada: true });

      await service.reprogramar('svc-1', EN_TRES_HORAS, actor, false);

      expect(serviciosRepository.update).toHaveBeenCalledWith(
        'svc-1',
        expect.objectContaining({ notificacionPreviaEnviada: false }),
      );
    });

    it('rechaza una hora que ya pasó', async () => {
      await expect(
        service.reprogramar(
          'svc-1',
          new Date(Date.now() - 60_000),
          actor,
          false,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(serviciosRepository.update).not.toHaveBeenCalled();
    });

    /*
     * Un servicio no choca consigo mismo: sin excluirlo del barrido, mover una
     * cita media hora seria siempre imposible.
     */
    it('no considera al propio servicio un choque de horarios', async () => {
      serviciosRepository.manager.find.mockResolvedValue([servicioGuardado]);

      await expect(
        service.reprogramar('svc-1', EN_TRES_HORAS, actor, false),
      ).resolves.toBeDefined();
    });

    it('rechaza la hora si la modelo ya tiene otro compromiso encima', async () => {
      serviciosRepository.manager.find.mockResolvedValue([
        {
          id: 'svc-otro',
          duracionPactadaHoras: 2,
          fechaProgramada: EN_TRES_HORAS,
        },
      ]);

      await expect(
        service.reprogramar('svc-1', EN_TRES_HORAS, actor, false),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('no deja reprogramar un servicio que ya está en curso', async () => {
      servicioGuardado = citaAgendada({ estado: 'en_curso' });

      await expect(
        service.reprogramar('svc-1', EN_TRES_HORAS, actor, false),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('avisa al cliente con un texto fijo, sin pasar por la IA', async () => {
      await service.reprogramar('svc-1', EN_TRES_HORAS, actor, true);

      expect(bot.telegram.sendMessage).toHaveBeenCalledWith(
        '555',
        expect.stringContaining('Lauren'),
      );
    });

    it('no avisa al cliente cuando es una corrección de captura', async () => {
      await service.reprogramar('svc-1', EN_TRES_HORAS, actor, false);

      expect(bot.telegram.sendMessage).not.toHaveBeenCalled();
      // A la modelo se le avisa siempre: es ella quien se tiene que presentar.
      expect(notificationsService.notificar).toHaveBeenCalled();
    });

    /*
     * El aviso es accesorio: la hora ya esta guardada y que Telegram falle no
     * la deshace.
     */
    it('no deshace el cambio porque el aviso falle', async () => {
      bot.telegram.sendMessage.mockRejectedValueOnce(new Error('Telegram 403'));

      await expect(
        service.reprogramar('svc-1', EN_TRES_HORAS, actor, true),
      ).resolves.toBeDefined();
    });
  });

  describe('cambiarUbicacion', () => {
    it('mueve el servicio a un lugar registrado y le quita el cargo de transporte', async () => {
      transportOperations.activeLocations.mockResolvedValue([
        {
          id: 'loc-1',
          name: 'Majestic',
          address: 'Dirección de Majestic',
          latitude: 20.6,
          longitude: -100.4,
        },
      ]);

      await service.cambiarUbicacion(
        'svc-1',
        { presetLocationId: 'loc-1' },
        actor,
      );

      expect(serviciosRepository.update).toHaveBeenCalledWith('svc-1', {
        ubicacionClienteLat: 20.6,
        ubicacionClienteLng: -100.4,
        presetLocationId: 'loc-1',
        locationNameSnapshot: 'Majestic',
        locationAddressSnapshot: 'Dirección de Majestic',
        customerTransportCharge: 0,
      });
    });

    it('rechaza un lugar que ya no está activo', async () => {
      transportOperations.activeLocations.mockResolvedValue([]);

      await expect(
        service.cambiarUbicacion('svc-1', { presetLocationId: 'loc-1' }, actor),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('guarda una dirección con sus coordenadas y le aplica la tarifa externa', async () => {
      await service.cambiarUbicacion(
        'svc-1',
        {
          latitud: 20.59,
          longitud: -100.39,
          direccion: 'Av. Constituyentes 123',
        },
        actor,
      );

      expect(serviciosRepository.update).toHaveBeenCalledWith('svc-1', {
        ubicacionClienteLat: 20.59,
        ubicacionClienteLng: -100.39,
        presetLocationId: null,
        locationNameSnapshot: null,
        locationAddressSnapshot: 'Av. Constituyentes 123',
        customerTransportCharge: 150,
      });
    });

    /*
     * La operacion solo atiende Queretaro: una direccion fuera del area no se
     * cotiza, se rechaza, igual que se hace con el pin del cliente en el chat.
     */
    it('rechaza una dirección fuera del área de cobertura', async () => {
      await expect(
        service.cambiarUbicacion(
          'svc-1',
          {
            latitud: 19.4326,
            longitud: -99.1332,
            direccion: 'Ciudad de México',
          },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(serviciosRepository.update).not.toHaveBeenCalled();
    });

    it('exige un destino, y solo uno', async () => {
      await expect(
        service.cambiarUbicacion('svc-1', {}, actor),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.cambiarUbicacion(
          'svc-1',
          { presetLocationId: 'loc-1', latitud: 20.59, longitud: -100.39 },
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('no deja cambiar el sitio de un servicio ya en curso', async () => {
      servicioGuardado = citaAgendada({ estado: 'en_curso' });

      await expect(
        service.cambiarUbicacion('svc-1', { presetLocationId: 'loc-1' }, actor),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
