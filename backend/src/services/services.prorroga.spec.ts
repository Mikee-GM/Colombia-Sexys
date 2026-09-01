import { ForbiddenException } from '@nestjs/common';
import { ServicesService } from './services.service';

/**
 * La prorroga de espera: los diez minutos que se piden cuando la modelo va con
 * retraso y el cliente ya esta esperando.
 *
 * Lo que importa aqui no es contar prorrogas --de eso se encarga
 * `ExtensionsService`, con la fila bloqueada-- sino los tres efectos que hasta
 * hace poco vivian dentro del handler de Telegram y por eso el portal no podia
 * provocar: quien tiene permiso, que el reloj de espera vuelva a empezar y que
 * el chofer que espera abajo se entere.
 */
describe('ServicesService solicitarProrroga', () => {
  const MINUTOS_EN_MS = 10 * 60 * 1000;

  function armar(servicio: unknown, participante: unknown = null) {
    const requestServiceExtension = jest
      .fn()
      .mockResolvedValue({ extensionNumber: 1, minutes: 10 });
    const sendMessage = jest.fn().mockResolvedValue(undefined);
    const notificar = jest.fn().mockResolvedValue(1);
    const startWaitTimeout = jest.fn();

    /*
     * Se construye por nombre y no con `new`: este servicio tiene mas de veinte
     * dependencias, y con la lista posicional cada una nueva desplazaba todos
     * los dobles. El registro entra como doble porque `Object.create` no
     * ejecuta los campos inicializados de la clase.
     */
    const service = Object.create(ServicesService.prototype) as ServicesService;
    Object.assign(service, {
      logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      // Los dos relojes en memoria del servicio: son campos inicializados
      // de la clase, y `Object.create` no los ejecuta.
      waitTimeouts: new Map(),
      dispatchTimeouts: new Map(),
      serviciosRepository: { findOne: jest.fn().mockResolvedValue(servicio) },
      serviceParticipantsRepository: {
        findOne: jest.fn().mockResolvedValue(participante),
      },
      extensionsService: { requestServiceExtension },
      telegramService: { sendMessage },
      notificationsService: { notificar },
      startWaitTimeout,
    });

    return {
      service,
      requestServiceExtension,
      sendMessage,
      notificar,
      startWaitTimeout,
    };
  }

  const choferEnEspera = {
    tipo: 'ida',
    chofer: {
      usuarioId: 'usuario-chofer',
      usuario: { telegramChatId: '555' },
    },
  };

  it('reinicia el reloj de espera, que es lo que hace que la prorroga sirva', async () => {
    const { service, startWaitTimeout } = armar({
      id: 'servicio-1',
      serviceType: 'individual',
      empleada: { usuarioId: 'usuario-modelo', nombreArtistico: 'Ana' },
      viajes: [choferEnEspera],
    });

    const resultado = await service.solicitarProrroga(
      'servicio-1',
      'usuario-modelo',
    );

    expect(startWaitTimeout).toHaveBeenCalledWith('servicio-1', MINUTOS_EN_MS);
    expect(resultado).toEqual({
      prorrogasUsadas: 1,
      restantes: 2,
      minutos: 10,
    });
  });

  it('avisa al chofer, que es el unico al que la espera le cambia el plan', async () => {
    const { service, sendMessage, notificar } = armar({
      id: 'servicio-1',
      serviceType: 'individual',
      empleada: { usuarioId: 'usuario-modelo', nombreArtistico: 'Ana' },
      viajes: [choferEnEspera],
    });

    await service.solicitarProrroga('servicio-1', 'usuario-modelo');

    expect(sendMessage).toHaveBeenCalledWith(
      '555',
      expect.stringContaining('Ana'),
    );
    expect(notificar).toHaveBeenCalledWith(
      'usuario-chofer',
      expect.objectContaining({ url: '/chofer/portal' }),
    );
  });

  it('no la concede a quien no es la modelo del servicio', async () => {
    const { service, requestServiceExtension } = armar({
      id: 'servicio-1',
      serviceType: 'individual',
      empleada: { usuarioId: 'usuario-modelo', nombreArtistico: 'Ana' },
      viajes: [],
    });

    await expect(
      service.solicitarProrroga('servicio-1', 'usuario-de-otra'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(requestServiceExtension).not.toHaveBeenCalled();
  });

  /*
   * En un grupal no hay una sola modelo: cualquiera de las que siguen dentro
   * puede ir con retraso. El chat ya lo permitia, asi que restringirlo a la
   * titular al mover la logica al servicio habria quitado en silencio algo que
   * funcionaba.
   */
  it('la concede a una participante de un servicio grupal', async () => {
    const { service, startWaitTimeout } = armar(
      {
        id: 'servicio-grupal',
        serviceType: 'grupal',
        empleada: { usuarioId: 'usuario-titular', nombreArtistico: 'Ana' },
        viajes: [],
      },
      { id: 'participante-1' },
    );

    await service.solicitarProrroga('servicio-grupal', 'usuario-participante');

    expect(startWaitTimeout).toHaveBeenCalled();
  });

  it('un aviso que falla no deshace la prorroga ya concedida', async () => {
    const { service, notificar, startWaitTimeout } = armar({
      id: 'servicio-1',
      serviceType: 'individual',
      empleada: { usuarioId: 'usuario-modelo', nombreArtistico: 'Ana' },
      viajes: [choferEnEspera],
    });
    notificar.mockRejectedValue(new Error('sin red'));

    await expect(
      service.solicitarProrroga('servicio-1', 'usuario-modelo'),
    ).resolves.toMatchObject({ prorrogasUsadas: 1 });
    expect(startWaitTimeout).toHaveBeenCalled();
  });
});
