import { NotificationsBridge } from './notifications.bridge';

/**
 * El aviso al jefe de que el cliente escribio.
 *
 * Es el unico aviso del puente que no sale siempre que llega su evento:
 * `chat_message` se emite tambien por cada respuesta de la IA y por cada nota
 * del sistema. Sin filtrar, una conversacion normal seria una lluvia de avisos
 * por algo que el jefe no tiene que atender.
 *
 * Y el agrupado importa igual: el `tag` se saca del servicio y no del mensaje,
 * porque agrupar por mensaje convertiria diez mensajes seguidos en diez avisos
 * apilados en la pantalla de bloqueo.
 */
describe('NotificationsBridge: mensajes del cliente', () => {
  function armar() {
    const notificar = jest.fn().mockResolvedValue(1);

    /*
     * Se construye por nombre y no con `new`, como el resto de los specs de la
     * casa. El registro entra como doble porque `Object.create` no ejecuta los
     * campos inicializados de la clase.
     */
    const bridge = Object.create(
      NotificationsBridge.prototype,
    ) as NotificationsBridge;
    Object.assign(bridge, {
      logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      notifications: { notificar },
      realtime: {},
    });

    /** El evento tal cual lo emite el chat, dirigido al canal del jefe. */
    const evento = (emisor: string, servicioId = 'svc-1') => ({
      target: 'boss',
      key: 'user-jefe',
      event: {
        type: 'chat_message',
        data: { id: 'msg-' + Math.random(), servicioId, emisor },
      },
    });

    return { bridge, notificar, evento };
  }

  it('avisa cuando escribe el cliente', async () => {
    const { bridge, notificar, evento } = armar();

    await (
      bridge as unknown as {
        alEvento: (m: unknown) => Promise<void>;
      }
    ).alEvento(evento('cliente'));

    expect(notificar).toHaveBeenCalledWith(
      'user-jefe',
      expect.objectContaining({ titulo: 'El cliente escribió' }),
    );
  });

  it.each(['ia', 'sistema', 'empleada'])(
    'no avisa por un mensaje de %s',
    async (emisor) => {
      const { bridge, notificar, evento } = armar();

      await (
        bridge as unknown as {
          alEvento: (m: unknown) => Promise<void>;
        }
      ).alEvento(evento(emisor));

      expect(notificar).not.toHaveBeenCalled();
    },
  );

  /*
   * El aviso reemplaza al anterior en vez de apilarse. Sin esto, un cliente
   * escribiendo cuatro lineas seguidas deja cuatro avisos que hay que descartar
   * uno por uno.
   */
  it('agrupa los mensajes de una misma conversacion en un solo aviso', async () => {
    const { bridge, notificar, evento } = armar();
    const alEvento = (
      bridge as unknown as { alEvento: (m: unknown) => Promise<void> }
    ).alEvento.bind(bridge);

    await alEvento(evento('cliente', 'svc-1'));
    await alEvento(evento('cliente', 'svc-1'));

    const [primero, segundo] = notificar.mock.calls as [
      [string, { tag: string }],
      [string, { tag: string }],
    ];
    expect(primero[1].tag).toBe(segundo[1].tag);
    expect(primero[1].tag).toContain('svc-1');
  });

  it('dos conversaciones distintas no se pisan', async () => {
    const { bridge, notificar, evento } = armar();
    const alEvento = (
      bridge as unknown as { alEvento: (m: unknown) => Promise<void> }
    ).alEvento.bind(bridge);

    await alEvento(evento('cliente', 'svc-1'));
    await alEvento(evento('cliente', 'svc-2'));

    const [primero, segundo] = notificar.mock.calls as [
      [string, { tag: string }],
      [string, { tag: string }],
    ];
    expect(primero[1].tag).not.toBe(segundo[1].tag);
  });
});
