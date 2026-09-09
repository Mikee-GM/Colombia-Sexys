import { NotificationsBridge } from './notifications.bridge';

/**
 * El aviso al jefe de que la modelo ya subió al coche o ya llegó.
 *
 * El evento `trip_status_updated` ya se emitía y el panel se refrescaba con él,
 * pero en silencio: el jefe tenía que estar mirando la pantalla y darse cuenta
 * de que una fila había cambiado, y fuera del panel no le llegaba nada. Son los
 * dos momentos en los que necesita saber si el traslado va bien.
 *
 * Ese mismo evento lleva dentro cuatro sucesos distintos, y dos de ellos los
 * provoca el propio jefe --marcar el Uber en camino y marcar que llegó--:
 * avisarle de lo que acaba de pulsar sería ruido.
 */
describe('NotificationsBridge: avance del traslado', () => {
  function armar() {
    const notificar = jest.fn().mockResolvedValue(1);

    const bridge = Object.create(
      NotificationsBridge.prototype,
    ) as NotificationsBridge;
    Object.assign(bridge, {
      logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      notifications: { notificar },
      realtime: {},
    });

    const evento = (action: string, tripType: 'ida' | 'regreso' = 'ida') => ({
      target: 'boss',
      key: 'user-jefe',
      event: {
        type: 'trip_status_updated',
        data: {
          serviceId: 'svc-1',
          tripId: 'trip-1',
          action,
          tripType,
          employeeName: 'Valeria',
        },
      },
    });

    const disparar = (mensaje: unknown) =>
      (
        bridge as unknown as { alEvento: (m: unknown) => Promise<void> }
      ).alEvento(mensaje);

    return { notificar, evento, disparar };
  }

  it('avisa cuando la modelo dice que ya va en camino', async () => {
    const { notificar, evento, disparar } = armar();

    await disparar(evento('employee_en_route'));

    expect(notificar).toHaveBeenCalledWith('user-jefe', {
      titulo: 'Traslado en marcha',
      cuerpo: 'Una empleada ya va en camino. Toca para verlo.',
      url: '/jefe',
      tag: 'traslado-svc-1',
      tipo: 'trip_status_updated',
    });
  });

  it('avisa cuando confirma que llegó', async () => {
    const { notificar, evento, disparar } = armar();

    await disparar(evento('employee_arrived'));

    expect(notificar).toHaveBeenCalledWith(
      'user-jefe',
      expect.objectContaining({
        titulo: 'Llegada confirmada',
        cuerpo: 'Una empleada llegó al punto. Toca para verlo.',
      }),
    );
  });

  it('distingue el viaje de vuelta', async () => {
    const { notificar, evento, disparar } = armar();

    await disparar(evento('employee_arrived', 'regreso'));

    expect(notificar).toHaveBeenCalledWith(
      'user-jefe',
      expect.objectContaining({
        cuerpo: 'Una empleada llegó a su casa. Toca para verlo.',
      }),
    );
  });

  /** Lo que pulsa el propio jefe no se le devuelve como aviso. */
  it('no avisa de las acciones del jefe sobre el Uber', async () => {
    const { notificar, evento, disparar } = armar();

    await disparar(evento('uber_en_route'));
    await disparar(evento('uber_arrived'));

    expect(notificar).not.toHaveBeenCalled();
  });

  /**
   * El nombre de la modelo viaja en el evento para que el panel pueda decir de
   * quién habla, pero el push se lee en la pantalla de bloqueo, a la vista de
   * quien pase por al lado: ahí no sale ningún nombre.
   */
  it('no mete el nombre de la modelo en el push', async () => {
    const { notificar, evento, disparar } = armar();

    await disparar(evento('employee_arrived'));

    const aviso = notificar.mock.calls[0][1] as {
      titulo: string;
      cuerpo: string;
    };
    expect(`${aviso.titulo} ${aviso.cuerpo}`).not.toContain('Valeria');
  });

  /** Todos los del mismo servicio se apilan en uno que se va reemplazando. */
  it('agrupa los avisos por servicio', async () => {
    const { notificar, evento, disparar } = armar();

    await disparar(evento('employee_en_route'));
    await disparar(evento('employee_arrived'));

    expect(notificar.mock.calls[0][1]).toMatchObject({
      tag: 'traslado-svc-1',
    });
    expect(notificar.mock.calls[1][1]).toMatchObject({
      tag: 'traslado-svc-1',
    });
  });
});
