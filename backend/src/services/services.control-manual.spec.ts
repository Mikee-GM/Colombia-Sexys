import { ConflictException } from '@nestjs/common';
import { ServicesService } from './services.service';

/**
 * Las dos palancas manuales sobre un servicio: borrarlo y cerrarlo por la
 * oficina.
 *
 * Las dos existen para cuando algo se sale del camino previsto, y las dos son
 * peligrosas por motivos opuestos. Borrar destruye historial, asi que lo que se
 * fija aqui es hasta donde llega. Cerrar por la oficina hace lo contrario --si
 * no existiera, la salida seria editar la fila a mano y dejar el servicio
 * marcado como cerrado sin liberar a la modelo, sin pedir el regreso y sin
 * liquidacion-- asi que lo que se fija es que pase por el mismo camino que el
 * cierre de ella.
 */
describe('ServicesService control manual', () => {
  function armar(servicio: unknown, hayViajes = false) {
    const remove = jest.fn().mockResolvedValue(undefined);
    const cerrarServicio = jest.fn().mockResolvedValue({ servicio });

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
        remove,
      },
      viajesRepository: { exists: jest.fn().mockResolvedValue(hayViajes) },
    });

    // El cierre de verdad se prueba en su propio spec; aqui interesa quien
    // llega a el y con que queda marcado el servicio.
    (service as unknown as Record<string, unknown>).cerrarServicio =
      cerrarServicio;
    (service as unknown as Record<string, unknown>).findOne = jest
      .fn()
      .mockResolvedValue(servicio);
    (
      service as unknown as Record<string, unknown>
    ).assertActorCanManageService = jest.fn();

    return { service, remove, cerrarServicio };
  }

  describe('borrar un servicio', () => {
    it('deja borrar uno que todavia no ha empezado', async () => {
      const { service, remove } = armar({ id: 'svc-1', estado: 'pendiente' });

      await expect(service.remove('svc-1')).resolves.toEqual({ deleted: true });
      expect(remove).toHaveBeenCalled();
    });

    /*
     * Borrar uno finalizado se lleva por delante la liquidacion de la que forma
     * parte, y sin dejar rastro de que falta algo. Para eso esta cancelar, que
     * guarda el motivo, el autor y el momento.
     */
    it.each(['en_curso', 'finalizado', 'cancelado'])(
      'no deja borrar uno en estado %s',
      async (estado) => {
        const { service, remove } = armar({ id: 'svc-1', estado });

        await expect(service.remove('svc-1')).rejects.toBeInstanceOf(
          ConflictException,
        );
        expect(remove).not.toHaveBeenCalled();
      },
    );

    it('tampoco si ya tiene transporte asignado', async () => {
      const { service, remove } = armar(
        { id: 'svc-1', estado: 'agendado' },
        true,
      );

      await expect(service.remove('svc-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(remove).not.toHaveBeenCalled();
    });
  });

  describe('cerrar por la oficina', () => {
    const enCurso = {
      id: 'svc-1',
      estado: 'en_curso',
      serviceType: 'individual',
      empleadaId: 'emp-1',
    };

    it('anota quien lo cerro y por que antes de cerrarlo', async () => {
      const servicio = { ...enCurso };
      const { service, cerrarServicio } = armar(servicio);

      await service.finishByOffice(
        'svc-1',
        { id: 'user-jefe', rol: 'jefe' } as never,
        'Se quedó sin batería y no pudo cerrarlo ella',
      );

      // El marcado va sobre el mismo objeto que se cierra: asi las tres
      // columnas viajan en la misma escritura que el estado.
      expect(cerrarServicio).toHaveBeenCalledWith(
        expect.objectContaining({
          cerradoPorOficinaUserId: 'user-jefe',
          motivoCierreOficina: 'Se quedó sin batería y no pudo cerrarlo ella',
        }),
      );
      expect(servicio).toHaveProperty('cerradoPorOficinaAt');
    });

    /*
     * Un grupal tiene su propio cierre, que reparte entre participantes y cuadra
     * el saldo pendiente. Pasarlo por este camino lo dejaria a medias.
     */
    it('rechaza un grupal, que se cierra por otro camino', async () => {
      const { service, cerrarServicio } = armar({
        ...enCurso,
        serviceType: 'grupal',
      });

      await expect(
        service.finishByOffice(
          'svc-1',
          { id: 'user-jefe', rol: 'jefe' } as never,
          'Un motivo suficientemente largo',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(cerrarServicio).not.toHaveBeenCalled();
    });

    it('el motivo se recorta al tope de la columna', async () => {
      const { service, cerrarServicio } = armar({ ...enCurso });

      await service.finishByOffice(
        'svc-1',
        { id: 'user-admin', rol: 'admin' } as never,
        'x'.repeat(3000),
      );

      const marcado = cerrarServicio.mock.calls[0][0] as {
        motivoCierreOficina: string;
      };
      expect(marcado.motivoCierreOficina).toHaveLength(2000);
    });
  });
});
