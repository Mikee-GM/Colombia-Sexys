import { ServicesService } from './services.service';

/**
 * El aviso de "termina en quince minutos, ¿lo extiendes?".
 *
 * Es de nivel 1: la ventana para decidir es corta y ella esta trabajando. Y
 * hasta hace poco el bucle descartaba el servicio entero cuando la modelo no
 * tenia chat de Telegram, con lo que ni siquiera salia el push. Desde que se
 * puede entrar al portal con correo y contrasena eso deja gente sin el aviso,
 * asi que aqui se fija que el push no dependa del chat.
 */
describe('ServicesService checkActiveServicesForExtension', () => {
  const UNA_HORA_MS = 60 * 60 * 1000;

  function armar(servicios: unknown[]) {
    const notificar = jest.fn().mockResolvedValue(1);
    const sendMessage = jest.fn().mockResolvedValue(undefined);
    const save = jest.fn((v) => v);

    /*
     * Se construye por nombre y no con `new`: son mas de veinte dependencias, y
     * con la lista posicional cada una nueva desplazaba todos los dobles. El
     * registro y los relojes en memoria entran como dobles porque
     * `Object.create` no ejecuta los campos inicializados.
     */
    const service = Object.create(ServicesService.prototype) as ServicesService;
    Object.assign(service, {
      logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      waitTimeouts: new Map(),
      dispatchTimeouts: new Map(),
      serviciosRepository: {
        find: jest.fn().mockResolvedValue(servicios),
        save,
      },
      bot: { telegram: { sendMessage } },
      notificationsService: { notificar },
    });

    return { service, notificar, sendMessage, save };
  }

  /** Uno que termina dentro de diez minutos: ya entra en la ventana de aviso. */
  function porTerminar(extras: Record<string, unknown> = {}) {
    return {
      id: 'svc-1',
      metodoPago: 'tarjeta',
      duracionPactadaHoras: 1,
      horaInicioServicio: new Date(Date.now() - 50 * 60 * 1000),
      empleada: { usuarioId: 'user-emp', usuario: {} },
      ...extras,
    };
  }

  it('avisa por push a una modelo que no usa Telegram', async () => {
    const { service, notificar, sendMessage } = armar([porTerminar()]);

    await service.checkActiveServicesForExtension();

    expect(notificar).toHaveBeenCalledWith(
      'user-emp',
      expect.objectContaining({ titulo: '¿Extiendes el servicio?' }),
    );
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('con Telegram salen los dos: el push y el mensaje con los botones', async () => {
    const { service, notificar, sendMessage } = armar([
      porTerminar({
        empleada: { usuarioId: 'user-emp', usuario: { telegramChatId: '555' } },
      }),
    ]);

    await service.checkActiveServicesForExtension();

    expect(notificar).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      '555',
      expect.stringContaining('15 minutos'),
      expect.anything(),
    );
  });

  it('no avisa de uno al que todavia le sobra tiempo', async () => {
    const { service, notificar } = armar([
      porTerminar({
        duracionPactadaHoras: 4,
        horaInicioServicio: new Date(Date.now() - UNA_HORA_MS),
      }),
    ]);

    await service.checkActiveServicesForExtension();

    expect(notificar).not.toHaveBeenCalled();
  });

  /*
   * En efectivo se cobra al terminar y la extension se acuerda en el momento;
   * el aviso solo tiene sentido cuando el cobro ya paso por tarjeta o
   * transferencia y alargar significa volver a cobrar.
   */
  it('no avisa cuando el pago fue en efectivo', async () => {
    const { service, notificar } = armar([
      porTerminar({ metodoPago: 'efectivo' }),
    ]);

    await service.checkActiveServicesForExtension();

    expect(notificar).not.toHaveBeenCalled();
  });

  it('marca el aviso como enviado para no repetirlo cada vuelta', async () => {
    const { service, save } = armar([porTerminar()]);

    await service.checkActiveServicesForExtension();

    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ notificacionExtensionEnviada: true }),
    );
  });
});
