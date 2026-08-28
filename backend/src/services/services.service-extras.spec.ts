import { ServicesService } from './services.service';

/**
 * Extras de un servicio en curso.
 *
 * La logica estaba repartida en los tres pasos del menu de Telegram, con las
 * mismas comprobaciones copiadas en cada uno y sin ninguna prueba. Lo que se
 * protege aqui es a quien se le imputa el extra y de que catalogo puede salir:
 * en un servicio grupal, cobrarle al cliente un extra de otra participante le
 * desviaria el dinero a la persona equivocada en el corte.
 */
describe('ServicesService extras de servicio', () => {
  const USUARIO = 'user-1';
  const EMPLEADA = 'emp-1';

  let serviciosRepository: any;
  let usuariosRepository: any;
  let extrasCatalogoRepository: any;
  let extrasServicioRepository: any;
  let participantsRepository: any;
  let service: ServicesService;

  const enCurso = (overrides: Record<string, unknown> = {}): any => ({
    id: 'srv-1',
    estado: 'en_curso',
    serviceType: 'individual',
    empleadaId: EMPLEADA,
    duracionPactadaHoras: 2,
    metodoPago: 'efectivo',
    totalFinal: 5000,
    empleada: { usuarioId: USUARIO },
    ...overrides,
  });

  const extra = (overrides: Record<string, unknown> = {}): any => ({
    id: 'extra-1',
    nombre: 'Extra de prueba',
    precio: 800,
    empleadaId: EMPLEADA,
    activo: true,
    ...overrides,
  });

  beforeEach(() => {
    serviciosRepository = { findOne: jest.fn(), save: jest.fn() };
    usuariosRepository = {
      findOneBy: jest.fn().mockResolvedValue({ id: USUARIO }),
    };
    extrasCatalogoRepository = { find: jest.fn(), findOne: jest.fn() };
    extrasServicioRepository = {
      create: jest.fn((valor) => valor),
      save: jest.fn().mockResolvedValue(undefined),
    };
    participantsRepository = { findOne: jest.fn() };

    service = new ServicesService(
      serviciosRepository,
      {} as any,
      {} as any,
      usuariosRepository,
      {} as any,
      {} as any,
      {} as any,
      { emitToJefes: jest.fn(), emitToBoss: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { get: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      extrasCatalogoRepository,
      extrasServicioRepository,
      participantsRepository,
    );
  });

  describe('listAvailableExtras', () => {
    it('devuelve solo los extras activos de la empleada asignada', async () => {
      serviciosRepository.findOne.mockResolvedValue(enCurso());
      extrasCatalogoRepository.find.mockResolvedValue([extra()]);

      const extras = await service.listAvailableExtras('srv-1', USUARIO);

      expect(extras).toHaveLength(1);
      expect(extrasCatalogoRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { empleadaId: EMPLEADA, activo: true },
        }),
      );
    });

    it('rechaza a quien no es la empleada del servicio', async () => {
      serviciosRepository.findOne.mockResolvedValue(enCurso());

      await expect(
        service.listAvailableExtras('srv-1', 'otro-usuario'),
      ).rejects.toThrow('No puedes modificar este servicio');
    });

    it('rechaza un servicio que ya no esta en curso', async () => {
      serviciosRepository.findOne.mockResolvedValue(
        enCurso({ estado: 'finalizado' }),
      );

      await expect(
        service.listAvailableExtras('srv-1', USUARIO),
      ).rejects.toThrow('ya no está activo');
    });

    it('en un grupal devuelve el catalogo de la participante que pregunta', async () => {
      serviciosRepository.findOne.mockResolvedValue(
        enCurso({ serviceType: 'grupal' }),
      );
      participantsRepository.findOne.mockResolvedValue({
        id: 'part-2',
        employeeId: 'emp-2',
      });
      extrasCatalogoRepository.find.mockResolvedValue([]);

      await service.listAvailableExtras('srv-1', USUARIO);

      expect(extrasCatalogoRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { empleadaId: 'emp-2', activo: true },
        }),
      );
    });

    it('rechaza a quien no participa en el servicio grupal', async () => {
      serviciosRepository.findOne.mockResolvedValue(
        enCurso({ serviceType: 'grupal' }),
      );
      participantsRepository.findOne.mockResolvedValue(null);

      await expect(
        service.listAvailableExtras('srv-1', USUARIO),
      ).rejects.toThrow('No participas en este servicio');
    });
  });

  describe('addServiceExtra', () => {
    const agregar = (metodoPago: any = 'efectivo') =>
      service.addServiceExtra({
        servicioId: 'srv-1',
        extraCatalogoId: 'extra-1',
        metodoPago,
        actorUserId: USUARIO,
      });

    it('registra el extra y devuelve el servicio ya recalculado', async () => {
      serviciosRepository.findOne
        .mockResolvedValueOnce(enCurso())
        .mockResolvedValueOnce(
          enCurso({
            totalFinal: 5800,
            extrasServicios: [
              {
                id: 'es-1',
                precioCobrado: 800,
                metodoPago: 'tarjeta',
                extraCatalogo: { nombre: 'Extra de prueba' },
              },
            ],
          }),
        );
      extrasCatalogoRepository.findOne.mockResolvedValue(extra());

      const resultado = await agregar('tarjeta');

      expect(extrasServicioRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          servicioId: 'srv-1',
          extraCatalogoId: 'extra-1',
          precioCobrado: 800,
          metodoPago: 'tarjeta',
          participantId: null,
        }),
      );
      expect(resultado.totalExtras).toBe(800);
      expect(Number(resultado.servicio.totalFinal)).toBe(5800);
      expect(resultado.extras[0].nombre).toBe('Extra de prueba');
    });

    it('imputa el extra a la participante en un servicio grupal', async () => {
      serviciosRepository.findOne
        .mockResolvedValueOnce(enCurso({ serviceType: 'grupal' }))
        .mockResolvedValueOnce(enCurso({ extrasServicios: [] }));
      participantsRepository.findOne.mockResolvedValue({
        id: 'part-2',
        employeeId: 'emp-2',
      });
      extrasCatalogoRepository.findOne.mockResolvedValue(
        extra({ empleadaId: 'emp-2' }),
      );

      await agregar();

      expect(extrasServicioRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ participantId: 'part-2' }),
      );
    });

    it('no deja cobrar un extra del catalogo de otra modelo', async () => {
      serviciosRepository.findOne.mockResolvedValue(enCurso());
      extrasCatalogoRepository.findOne.mockResolvedValue(
        extra({ empleadaId: 'emp-ajena' }),
      );

      await expect(agregar()).rejects.toThrow('no pertenece a tu catálogo');
      expect(extrasServicioRepository.save).not.toHaveBeenCalled();
    });

    it('no deja cobrar un extra desactivado', async () => {
      serviciosRepository.findOne.mockResolvedValue(enCurso());
      extrasCatalogoRepository.findOne.mockResolvedValue(
        extra({ activo: false }),
      );

      await expect(agregar()).rejects.toThrow('ya no está disponible');
      expect(extrasServicioRepository.save).not.toHaveBeenCalled();
    });

    it('no agrega extras a un servicio que ya termino', async () => {
      serviciosRepository.findOne.mockResolvedValue(
        enCurso({ estado: 'finalizado' }),
      );

      await expect(agregar()).rejects.toThrow('ya no está activo');
      expect(extrasServicioRepository.save).not.toHaveBeenCalled();
    });

    it('rechaza a quien no es la empleada del servicio', async () => {
      serviciosRepository.findOne.mockResolvedValue(enCurso());

      await expect(
        service.addServiceExtra({
          servicioId: 'srv-1',
          extraCatalogoId: 'extra-1',
          metodoPago: 'efectivo',
          actorUserId: 'otro-usuario',
        }),
      ).rejects.toThrow('No puedes modificar este servicio');
      expect(extrasServicioRepository.save).not.toHaveBeenCalled();
    });
  });
});
