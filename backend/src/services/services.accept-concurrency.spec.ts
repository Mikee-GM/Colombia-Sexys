import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ServicesService } from './services.service';

/**
 * Pulsar dos veces "Aceptar", y aceptar a la vez dos solicitudes de la misma
 * empleada.
 *
 * Las dos cosas pasaban porque la comprobacion de estado se hacia en memoria
 * sobre una fila leida antes de actuar: los dos toques la superaban y se creaba
 * un viaje por cada uno. Ahora la condicion viaja dentro del UPDATE y la
 * empleada se bloquea mientras se decide, asi que solo una llamada puede ganar.
 */
describe('ServicesService.aceptar (concurrencia)', () => {
  let serviciosRepository: any;
  let viajesRepository: any;
  let manager: any;
  let updateBuilder: any;
  let empleadasRepository: any;
  let service: ServicesService;

  const servicioPendiente = () => ({
    id: 'srv-1',
    estado: 'pendiente',
    empleadaId: 'emp-1',
    clienteId: 'cli-1',
    serviceType: 'individual',
    jefeId: 'jefe-1',
    duracionPactadaHoras: 2,
    metodoPago: 'efectivo',
    horaInicioServicio: null,
    presetLocationId: null,
    customerTransportCharge: 0,
    empleada: { id: 'emp-1', nombreArtistico: 'Ana', usuario: null },
    cliente: { nombreTelegram: 'Cliente' },
  });

  beforeEach(() => {
    jest.clearAllMocks();

    updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      // Por defecto gana: la fila seguia pendiente.
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    empleadasRepository = { update: jest.fn() };
    manager = {
      // Sin otro servicio en curso de esa empleada.
      findOne: jest.fn().mockResolvedValue(null),
      getRepository: jest.fn().mockReturnValue({
        createQueryBuilder: jest.fn().mockReturnValue({
          setLock: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          getOneOrFail: jest.fn().mockResolvedValue({ id: 'emp-1' }),
        }),
        update: empleadasRepository.update,
      }),
      createQueryBuilder: jest.fn(() => updateBuilder),
    };
    serviciosRepository = {
      findOne: jest.fn().mockResolvedValue(servicioPendiente()),
      save: jest.fn((row: unknown) => Promise.resolve(row)),
      manager: {
        transaction: jest.fn((callback: any) => callback(manager)),
        getRepository: jest.fn().mockReturnValue({
          findOne: jest.fn().mockResolvedValue({ id: 'jefe-1', rol: 'jefe' }),
          update: jest.fn(),
        }),
      },
      createQueryBuilder: jest.fn(() => updateBuilder),
    };
    viajesRepository = {
      create: jest.fn((data: unknown) => data),
      save: jest.fn((data: any) => Promise.resolve({ ...data, id: 'trip-1' })),
    };

    service = new ServicesService(
      serviciosRepository,
      viajesRepository,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {
        emitToBoss: jest.fn(),
        emitToEmployee: jest.fn(),
        emitToJefes: jest.fn(),
      } as any,
      { telegram: { sendMessage: jest.fn() } } as any,
      {} as any,
      { generate: jest.fn().mockResolvedValue('mensaje') } as any,
      {} as any,
      {} as any,
      { get: jest.fn() } as any,
      {
        assertOperationallyAllowed: jest.fn().mockResolvedValue(undefined),
      } as any,
      {} as any,
      empleadasRepository,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    // El despacho de choferes no es lo que se prueba aqui.
    jest.spyOn(service as any, 'dispatchViaje').mockResolvedValue(undefined);
  });

  it('acepta el servicio cuando la empleada esta libre y la fila sigue pendiente', async () => {
    await expect(service.aceptar('srv-1', 'jefe-1')).resolves.toEqual(
      expect.objectContaining({ estado: 'en_curso' }),
    );
    expect(viajesRepository.save).toHaveBeenCalledTimes(1);
    expect(empleadasRepository.update).toHaveBeenCalledWith('emp-1', {
      disponible: false,
    });
  });

  /** La segunda pulsacion: el UPDATE condicionado ya no encuentra la fila. */
  it('no crea un segundo viaje si otra pulsacion se adelanto', async () => {
    updateBuilder.execute.mockResolvedValue({ affected: 0 });

    await expect(service.aceptar('srv-1', 'jefe-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(viajesRepository.save).not.toHaveBeenCalled();
  });

  /**
   * Dos clientes pueden reservar a la vez a la misma empleada libre --lo
   * permite `reserveNext` a proposito-- pero aceptar los dos la dejaba con dos
   * servicios en curso, cada uno con su chofer.
   */
  it('rechaza aceptar un segundo servicio de una empleada ya ocupada', async () => {
    manager.findOne.mockResolvedValue({ id: 'srv-anterior' });

    await expect(service.aceptar('srv-1', 'jefe-1')).rejects.toThrow(
      /ya está atendiendo otro servicio/,
    );
    expect(viajesRepository.save).not.toHaveBeenCalled();
    expect(empleadasRepository.update).not.toHaveBeenCalled();
  });
});

/**
 * La extension sumaba horas sobre el valor leido antes de pulsar, sin mirar
 * quien pulsaba: tres toques eran tres horas mas en la cuenta del cliente.
 */
describe('ServicesService.extendByEmployee', () => {
  let serviciosRepository: any;
  let updateBuilder: any;
  let service: ServicesService;

  beforeEach(() => {
    jest.clearAllMocks();
    updateBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    serviciosRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'srv-1',
        estado: 'en_curso',
        empleadaId: 'emp-1',
        duracionPactadaHoras: 2,
        totalFinal: 4000,
        empleada: { usuarioId: 'user-emp', usuario: {} },
      }),
      createQueryBuilder: jest.fn(() => updateBuilder),
      manager: {},
    };
    service = new ServicesService(
      serviciosRepository,
      {} as any,
      {} as any,
      {} as any,
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
      {} as any,
      {} as any,
      {} as any,
    );
    jest
      .spyOn(service, 'recalculateScheduledSuccessor')
      .mockResolvedValue(undefined);
  });

  it('suma las horas cuando la pide la empleada asignada', async () => {
    await service.extendByEmployee('srv-1', 'user-emp', 1);

    expect(updateBuilder.set).toHaveBeenCalledWith(
      expect.objectContaining({ duracionPactadaHoras: 3 }),
    );
  });

  it('no deja extender a quien no es la empleada del servicio', async () => {
    await expect(
      service.extendByEmployee('srv-1', 'otro-usuario', 1),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(updateBuilder.execute).not.toHaveBeenCalled();
  });

  /** El segundo toque encuentra otra duracion y no vuelve a sumar. */
  it('no suma dos veces si la duracion cambio mientras tanto', async () => {
    updateBuilder.execute.mockResolvedValue({ affected: 0 });

    await expect(
      service.extendByEmployee('srv-1', 'user-emp', 1),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
