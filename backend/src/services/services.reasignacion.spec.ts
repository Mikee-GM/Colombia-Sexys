import { ConflictException } from '@nestjs/common';
import { ServicesService } from './services.service';

/**
 * Reasignar la modelo de un servicio y el chofer de un viaje.
 *
 * Antes no existian por ninguna via, y la unica salida era cancelar y volver a
 * crear: eso pierde la conversacion con el cliente, el historico y cualquier
 * anticipo ya registrado. Lo que se fija aqui son las tres decisiones que hacen
 * que reasignar sea seguro: que el precio pactado no se toque, que la modelo
 * anterior quede libre y la nueva ocupada, y que no se pueda reasignar sobre
 * algo ya cerrado.
 */
describe('ServicesService reasignaciones', () => {
  const ADMIN = { id: 'user-admin', rol: 'admin' } as never;

  function armar(
    servicio: Record<string, unknown> | null,
    nueva: Record<string, unknown> | null = {
      id: 'emp-2',
      usuarioId: 'user-emp-2',
      disponible: true,
      usuario: { activo: true },
    },
  ) {
    const actualizarServicio = jest.fn().mockResolvedValue(undefined);
    const actualizarEmpleada = jest.fn().mockResolvedValue(undefined);
    const notificar = jest.fn().mockResolvedValue(1);
    const emitToBoss = jest.fn();

    const manager = {
      update: jest.fn((entidad: { name?: string }, ...resto: unknown[]) =>
        entidad?.name === 'Empleadas'
          ? actualizarEmpleada(...resto)
          : actualizarServicio(...resto),
      ),
    };

    /*
     * Se construye por nombre y no por posicion: son mas de veinte
     * dependencias. Los campos inicializados entran como dobles porque
     * `Object.create` no los ejecuta.
     */
    const service = Object.create(ServicesService.prototype) as ServicesService;
    Object.assign(service, {
      logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      waitTimeouts: new Map(),
      dispatchTimeouts: new Map(),
      serviciosRepository: {
        findOne: jest.fn().mockResolvedValue(servicio),
        manager: {
          transaction: (fn: (m: unknown) => unknown) => fn(manager),
        },
      },
      empleadasRepository: { findOne: jest.fn().mockResolvedValue(nueva) },
      notificationsService: { notificar },
      realtimeEventsService: { emitToBoss },
    });

    (
      service as unknown as Record<string, unknown>
    ).assertActorCanManageService = jest.fn();
    (service as unknown as Record<string, unknown>).findOne = jest
      .fn()
      .mockResolvedValue(servicio);

    return { service, actualizarServicio, actualizarEmpleada, notificar };
  }

  const enCurso = {
    id: 'svc-1',
    estado: 'en_curso',
    serviceType: 'individual',
    empleadaId: 'emp-1',
    jefeId: 'jefe-1',
    empleada: { usuarioId: 'user-emp-1' },
  };

  it('cambia de modelo dejando anotado de quien venia y por que', async () => {
    const { service, actualizarServicio } = armar({ ...enCurso });

    await service.reasignarEmpleada(
      'svc-1',
      'emp-2',
      ADMIN,
      'Se enfermó media hora antes',
    );

    expect(actualizarServicio).toHaveBeenCalledWith(
      'svc-1',
      expect.objectContaining({
        empleadaId: 'emp-2',
        empleadaAnteriorId: 'emp-1',
        reasignadoPorUserId: 'user-admin',
        motivoReasignacion: 'Se enfermó media hora antes',
      }),
    );
  });

  /*
   * El precio se copia al crear justamente para que un cambio de tarifa
   * posterior no altere lo ya acordado. Aqui vale lo mismo: el cliente acepto un
   * importe y puede haberlo pagado; una reasignacion es un problema de la casa.
   */
  it('no toca el precio pactado con el cliente', async () => {
    const { service, actualizarServicio } = armar({ ...enCurso });

    await service.reasignarEmpleada(
      'svc-1',
      'emp-2',
      ADMIN,
      'Un motivo suficientemente largo',
    );

    const campos = actualizarServicio.mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(campos).not.toHaveProperty('precioBaseHoraPactado');
    expect(campos).not.toHaveProperty('totalBase');
  });

  it('libera a la anterior y ocupa a la nueva si ya estaba corriendo', async () => {
    const { service, actualizarEmpleada } = armar({ ...enCurso });

    await service.reasignarEmpleada(
      'svc-1',
      'emp-2',
      ADMIN,
      'Un motivo suficientemente largo',
    );

    expect(actualizarEmpleada).toHaveBeenCalledWith('emp-1', {
      disponible: true,
    });
    expect(actualizarEmpleada).toHaveBeenCalledWith('emp-2', {
      disponible: false,
    });
  });

  it('no toca la disponibilidad de uno que todavia no ha empezado', async () => {
    const { service, actualizarEmpleada } = armar({
      ...enCurso,
      estado: 'pendiente',
    });

    await service.reasignarEmpleada(
      'svc-1',
      'emp-2',
      ADMIN,
      'Un motivo suficientemente largo',
    );

    expect(actualizarEmpleada).not.toHaveBeenCalled();
  });

  it('avisa a las dos: una deja de ir y la otra tiene que salir', async () => {
    const { service, notificar } = armar({ ...enCurso });

    await service.reasignarEmpleada(
      'svc-1',
      'emp-2',
      ADMIN,
      'Un motivo suficientemente largo',
    );

    expect(notificar).toHaveBeenCalledWith(
      'user-emp-1',
      expect.objectContaining({ titulo: 'Ya no tienes este servicio' }),
    );
    expect(notificar).toHaveBeenCalledWith(
      'user-emp-2',
      expect.objectContaining({ titulo: 'Te asignaron un servicio' }),
    );
  });

  it.each(['finalizado', 'cancelado'])(
    'no reasigna uno en estado %s',
    async (estado) => {
      const { service, actualizarServicio } = armar({ ...enCurso, estado });

      await expect(
        service.reasignarEmpleada(
          'svc-1',
          'emp-2',
          ADMIN,
          'Un motivo suficientemente largo',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(actualizarServicio).not.toHaveBeenCalled();
    },
  );

  /*
   * Reasignar a una que ya esta ocupada recrea el problema que se venia a
   * resolver, y dejaria dos servicios en curso sobre la misma persona sin que
   * nadie lo decidiera.
   */
  it('no reasigna a una modelo que no esta disponible', async () => {
    const { service, actualizarServicio } = armar(
      { ...enCurso },
      {
        id: 'emp-2',
        usuarioId: 'user-emp-2',
        disponible: false,
        usuario: { activo: true },
      },
    );

    await expect(
      service.reasignarEmpleada(
        'svc-1',
        'emp-2',
        ADMIN,
        'Un motivo suficientemente largo',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(actualizarServicio).not.toHaveBeenCalled();
  });

  it('un grupal se reorganiza cambiando participantes, no asi', async () => {
    const { service } = armar({ ...enCurso, serviceType: 'grupal' });

    await expect(
      service.reasignarEmpleada(
        'svc-1',
        'emp-2',
        ADMIN,
        'Un motivo suficientemente largo',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
