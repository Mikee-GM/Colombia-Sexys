import { ServicesService } from './services.service';

/**
 * Rechazar una oferta de viaje.
 *
 * La prueba nace de un fallo real y caro: el viaje se cargaba con la relación
 * `chofer` --hace falta para poder editarle el mensaje del chat-- y luego se
 * hacía `viaje.choferId = null` seguido de `save`. TypeORM da precedencia al
 * objeto de la relación sobre la columna, así que volvía a escribir el mismo
 * chofer y el nulo se perdía sin ningún error.
 *
 * El efecto era que la oferta se quedaba pegada al chofer que acababa de
 * rechazarla: no desaparecía de su portal, y cada toque volvía a pasar el
 * control de "esta oferta es tuya" y le contaba otro rechazo. Tres toques al
 * mismo botón bastaban para llevarse la multa por rechazos seguidos.
 */
describe('ServicesService rechazarOfertaManual', () => {
  const viajesRepository = {
    update: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };
  const choferesRepository = {};

  const service = Object.create(ServicesService.prototype) as ServicesService;
  Object.assign(service, {
    logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
    waitTimeouts: new Map(),
    dispatchTimeouts: new Map(),
    viajesRepository,
    choferesRepository,
    serviciosRepository: {},
    bot: { telegram: { editMessageText: jest.fn() } },
    realtimeEventsService: { emitToJefes: jest.fn(), emitToDriver: jest.fn() },
  });

  /* El reparto al siguiente chofer y el conteo se prueban por su cuenta. */
  const dispatch = jest
    .spyOn(ServicesService.prototype as any, 'dispatchViaje')
    .mockResolvedValue(undefined);
  const contar = jest
    .spyOn(ServicesService.prototype as any, 'registrarRechazoDeChofer')
    .mockResolvedValue(undefined);

  const ofertaDe = (choferId: string | null) => ({
    id: 'viaje-1',
    estado: 'notificado',
    choferId,
    telegramChoferMsgOfertaId: null,
    chofer: choferId
      ? { id: choferId, usuario: { telegramChatId: null } }
      : null,
  });

  beforeEach(() => jest.clearAllMocks());

  it('suelta al chofer por columna y no guardando la entidad cargada', async () => {
    viajesRepository.findOne.mockResolvedValue(ofertaDe('chofer-1'));

    const rechazado = await service.rechazarOfertaManual('viaje-1', 'chofer-1');

    expect(rechazado).toBe(true);
    expect(viajesRepository.update).toHaveBeenCalledWith('viaje-1', {
      choferId: null,
      telegramChoferMsgOfertaId: null,
      ofertaExpiraEn: null,
    });
    // `save` volveria a escribir el chofer que trae la relacion cargada.
    expect(viajesRepository.save).not.toHaveBeenCalled();
    expect(contar).toHaveBeenCalledWith('chofer-1', null);
    expect(dispatch).toHaveBeenCalledWith('viaje-1');
  });

  /*
   * Sin este evento la tarjeta seguia en su portal aunque la oferta ya no fuera
   * suya: el canal del chofer no recibia nada del ciclo de la oferta, asi que
   * la pantalla solo cambiaba al recargar a mano.
   */
  it('avisa al portal del chofer de que la oferta dejo de ser suya', async () => {
    viajesRepository.findOne.mockResolvedValue(ofertaDe('chofer-1'));

    await service.rechazarOfertaManual('viaje-1', 'chofer-1');

    expect(
      (
        service as unknown as {
          realtimeEventsService: { emitToDriver: jest.Mock };
        }
      ).realtimeEventsService.emitToDriver,
    ).toHaveBeenCalledWith('chofer-1', {
      type: 'trip_offer_released',
      data: { tripId: 'viaje-1' },
    });
  });

  it('no cuenta un segundo rechazo sobre la misma oferta', async () => {
    // Ya soltada: el viaje sigue en `notificado` pero sin chofer.
    viajesRepository.findOne.mockResolvedValue(ofertaDe(null));

    const rechazado = await service.rechazarOfertaManual('viaje-1', 'chofer-1');

    expect(rechazado).toBe(false);
    expect(viajesRepository.update).not.toHaveBeenCalled();
    expect(contar).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('no cuenta el rechazo de un chofer al que ya no le toca la oferta', async () => {
    viajesRepository.findOne.mockResolvedValue(ofertaDe('chofer-2'));

    const rechazado = await service.rechazarOfertaManual('viaje-1', 'chofer-1');

    expect(rechazado).toBe(false);
    expect(contar).not.toHaveBeenCalled();
  });
});
