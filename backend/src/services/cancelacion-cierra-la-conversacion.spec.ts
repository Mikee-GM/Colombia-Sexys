import { ServicesService } from './services.service';

/**
 * Cancelar un servicio tiene que cerrar la conversacion del cliente.
 *
 * La cancelacion cambiaba estados y avisaba, pero no tocaba la sesion de
 * Telegram del cliente: seguia con su paso de conversacion puesto y apuntando a
 * la misma modelo, asi que el bot le contestaba en nombre de ella como si el
 * servicio siguiera vivo. Al pedir a otra desde el catalogo el cliente se
 * quedaba atrapado hablando con la primera.
 */
describe('ServicesService: la cancelacion cierra la conversacion del cliente', () => {
  const execute = jest.fn().mockResolvedValue({ affected: 1 });
  const telegramSessionRepository = {
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  const service = Object.create(ServicesService.prototype) as ServicesService;
  Object.assign(service, {
    logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
    telegramSessionRepository,
  });

  /** Lo que se acaba escribiendo en la fila de la sesion. */
  const datosEscritos = () =>
    telegramSessionRepository.createQueryBuilder.mock.results[0].value.update()
      .set.mock.calls[0][0].data;

  beforeEach(() => {
    jest.clearAllMocks();
    execute.mockResolvedValue({ affected: 1 });
    const set = jest.fn(() => ({ where: () => ({ execute }) }));
    telegramSessionRepository.createQueryBuilder.mockReturnValue({
      update: () => ({ set }),
    });
  });

  const servicio = (extra: Record<string, unknown> = {}): any => ({
    id: 'srv-1',
    empleadaId: 'emp-1',
    cliente: { telegramChatId: '555' },
    clienteTelegramId: null,
    ...extra,
  });

  it('borra la contratacion cuando la sesion sigue en esa modelo', async () => {
    telegramSessionRepository.findOne.mockResolvedValue({
      key: '555:555',
      version: 3,
      data: {
        step: 'CHAT_CON_EMPLEADA',
        empleadaId: 'emp-1',
        duracionPactadaHoras: 2,
        chatHistory: [{ role: 'user', parts: [{ text: 'Hola' }] }],
      },
    });

    await (service as any).cerrarConversacionDelCliente(servicio());

    expect(datosEscritos()).toEqual({});
    expect(execute).toHaveBeenCalled();
  });

  /*
   * Si el cliente ya esta hablando con otra, lo suyo es mas nuevo que esta
   * cancelacion: borrarselo seria tirar una negociacion en curso.
   */
  it('no toca la sesion si ya esta negociando con otra modelo', async () => {
    telegramSessionRepository.findOne.mockResolvedValue({
      key: '555:555',
      version: 3,
      data: { step: 'CHAT_CON_EMPLEADA', empleadaId: 'emp-otra' },
    });

    await (service as any).cerrarConversacionDelCliente(servicio());

    expect(telegramSessionRepository.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('conserva que ya se le explico un rechazo', async () => {
    telegramSessionRepository.findOne.mockResolvedValue({
      key: '555:555',
      version: 1,
      data: {
        step: 'CHAT_CON_EMPLEADA',
        empleadaId: 'emp-1',
        rechazoAvisadoServicioId: 'srv-rechazado',
      },
    });

    await (service as any).cerrarConversacionDelCliente(servicio());

    expect(datosEscritos()).toEqual({
      rechazoAvisadoServicioId: 'srv-rechazado',
    });
  });

  it('sin chat de Telegram no hay sesion que cerrar', async () => {
    await (service as any).cerrarConversacionDelCliente(
      servicio({ cliente: null }),
    );

    expect(telegramSessionRepository.findOne).not.toHaveBeenCalled();
  });

  /*
   * Que la sesion no se pueda limpiar no puede deshacer una cancelacion que ya
   * ocurrio: el fallo se registra y se sigue.
   */
  it('no propaga un fallo al limpiar la sesion', async () => {
    telegramSessionRepository.findOne.mockRejectedValue(new Error('sin base'));

    await expect(
      (service as any).cerrarConversacionDelCliente(servicio()),
    ).resolves.toBeUndefined();
  });
});
