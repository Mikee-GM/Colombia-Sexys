import { BadRequestException } from '@nestjs/common';
import { LocationsService } from './locations.service';

/**
 * La posicion que mandan los portales.
 *
 * Lo que se comprueba es la espera entre escrituras y que el evento salga con
 * el mismo nombre que el camino de Telegram: si esas dos cosas no se
 * sostuvieran, un telefono quieto seria una escritura por segundo sobre una
 * fila que ademas se lee en el reparto por cercania, y el mapa del jefe
 * dependeria de por donde llego la posicion.
 */
describe('LocationsService', () => {
  const CENTRO = { lat: 19.4326, lng: -99.1332 };
  /** Poco mas de un kilometro al norte: bastante para saltarse la espera. */
  const LEJOS = { lat: 19.4426, lng: -99.1332 };

  function armar(sujeto: 'chofer' | 'empleada' | 'ninguno' = 'chofer') {
    const emitToJefes = jest.fn();
    const actualizarChofer = jest.fn().mockResolvedValue(undefined);
    const actualizarEmpleada = jest.fn().mockResolvedValue(undefined);

    /*
     * Se construye por nombre y no con `new`, como el resto de los specs de la
     * casa: asi una dependencia nueva no desplaza los dobles. El registro entra
     * como doble porque `Object.create` no ejecuta los campos inicializados.
     */
    const service = Object.create(
      LocationsService.prototype,
    ) as LocationsService;
    Object.assign(service, {
      logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      ultimas: new Map(),
      choferes: {
        findOne: jest
          .fn()
          .mockResolvedValue(
            sujeto === 'chofer' ? { id: 'chofer-1', nombre: 'Beto' } : null,
          ),
        update: actualizarChofer,
      },
      empleadas: {
        findOne: jest
          .fn()
          .mockResolvedValue(
            sujeto === 'empleada'
              ? { id: 'empleada-1', nombreArtistico: 'Ana' }
              : null,
          ),
        update: actualizarEmpleada,
      },
      realtime: { emitToJefes },
    });

    return { service, emitToJefes, actualizarChofer, actualizarEmpleada };
  }

  it('guarda la primera posicion y la publica en el mapa del jefe', async () => {
    const { service, emitToJefes, actualizarChofer } = armar('chofer');

    const resultado = await service.registrar(
      'usuario-1',
      CENTRO.lat,
      CENTRO.lng,
    );

    expect(resultado).toEqual({ guardada: true });
    expect(actualizarChofer).toHaveBeenCalledWith(
      'chofer-1',
      expect.objectContaining({
        ubicacionLat: CENTRO.lat,
        ubicacionLng: CENTRO.lng,
      }),
    );
    expect(emitToJefes).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'DRIVER_LOCATION_UPDATE',
        choferId: 'chofer-1',
      }),
    );
  });

  it('no vuelve a escribir por un telefono quieto', async () => {
    const { service, actualizarChofer } = armar('chofer');

    await service.registrar('usuario-1', CENTRO.lat, CENTRO.lng);
    const segunda = await service.registrar(
      'usuario-1',
      CENTRO.lat,
      CENTRO.lng,
    );

    expect(segunda).toEqual({ guardada: false });
    expect(actualizarChofer).toHaveBeenCalledTimes(1);
  });

  /*
   * Un coche en movimiento no puede esperar el minuto entero: para cuando se
   * escribiera, la posicion ya no serviria para elegir al mas cercano.
   */
  it('escribe antes del minuto si se movio de verdad', async () => {
    const { service, actualizarChofer } = armar('chofer');

    await service.registrar('usuario-1', CENTRO.lat, CENTRO.lng);
    const segunda = await service.registrar('usuario-1', LEJOS.lat, LEJOS.lng);

    expect(segunda).toEqual({ guardada: true });
    expect(actualizarChofer).toHaveBeenCalledTimes(2);
  });

  it('la de una modelo va a su tabla y con su evento', async () => {
    const { service, emitToJefes, actualizarEmpleada } = armar('empleada');

    await service.registrar('usuario-2', CENTRO.lat, CENTRO.lng);

    expect(actualizarEmpleada).toHaveBeenCalledWith(
      'empleada-1',
      expect.objectContaining({ ubicacionLat: CENTRO.lat }),
    );
    expect(emitToJefes).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'EMPLOYEE_LOCATION_UPDATE',
        empleadaId: 'empleada-1',
      }),
    );
  });

  /*
   * Un jefe con el portal abierto no tiene fila donde anotarse. No es un error
   * suyo: simplemente no hay nada que guardar, y devolver un fallo haria que su
   * pantalla ensenara una alarma por algo que funciona como debe.
   */
  it('no falla con alguien que no esta en el mapa', async () => {
    const { service, actualizarChofer, actualizarEmpleada } = armar('ninguno');

    const resultado = await service.registrar(
      'usuario-jefe',
      CENTRO.lat,
      CENTRO.lng,
    );

    expect(resultado).toEqual({ guardada: false });
    expect(actualizarChofer).not.toHaveBeenCalled();
    expect(actualizarEmpleada).not.toHaveBeenCalled();
  });

  it('rechaza unas coordenadas fuera de rango', async () => {
    const { service } = armar('chofer');

    await expect(service.registrar('usuario-1', 91, 0)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  /*
   * La entrada por chat es la que atendia el manejador del bot con su propia
   * copia de todo esto. Lo que se fija aqui es que llegue al mismo sitio: la
   * misma tabla, el mismo evento y la misma espera entre escrituras.
   */
  describe('cuando la posicion llega por Telegram', () => {
    it('la anota igual y dice de quien es, que el bot contesta por su nombre', async () => {
      const { service, actualizarEmpleada, emitToJefes } = armar('empleada');

      const registro = await service.registrarPorTelegram(
        '555',
        CENTRO.lat,
        CENTRO.lng,
      );

      expect(registro).toEqual({
        guardada: true,
        rol: 'empleada',
        nombre: 'Ana',
      });
      expect(actualizarEmpleada).toHaveBeenCalledWith(
        'empleada-1',
        expect.objectContaining({ ubicacionLat: CENTRO.lat }),
      );
      expect(emitToJefes).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'EMPLOYEE_LOCATION_UPDATE' }),
      );
    });

    it('devuelve null para un cliente, que no es de la casa', async () => {
      const { service, actualizarChofer, actualizarEmpleada } =
        armar('ninguno');

      const registro = await service.registrarPorTelegram(
        '999',
        CENTRO.lat,
        CENTRO.lng,
      );

      expect(registro).toBeNull();
      expect(actualizarChofer).not.toHaveBeenCalled();
      expect(actualizarEmpleada).not.toHaveBeenCalled();
    });

    /*
     * Telegram refresca una ubicacion en vivo cada pocos segundos. La espera
     * frena la escritura, pero el evento sale igual: quien mira el mapa quiere
     * ver moverse el punto, y publicar no cuesta una escritura.
     */
    it('un refresco mueve el punto del mapa aunque no se escriba', async () => {
      const { service, actualizarChofer, emitToJefes } = armar('chofer');

      await service.registrarPorTelegram('555', CENTRO.lat, CENTRO.lng);
      const segundo = await service.registrarPorTelegram(
        '555',
        CENTRO.lat,
        CENTRO.lng,
      );

      expect(segundo?.guardada).toBe(false);
      expect(actualizarChofer).toHaveBeenCalledTimes(1);
      expect(emitToJefes).toHaveBeenCalledTimes(2);
    });
  });
});
