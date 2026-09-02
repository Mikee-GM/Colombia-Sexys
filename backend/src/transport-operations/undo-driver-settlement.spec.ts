import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SettlementsService } from './settlements.service';

/**
 * Deshacer una semana ya pagada de un chofer.
 *
 * La liquidacion de una modelo se podia deshacer desde el principio; la del
 * chofer no, y el caso es el mismo: aparece un viaje que faltaba, o se cerro el
 * periodo equivocado. Lo que se fija aqui es que deshacer suelte los viajes
 * --sin eso, la semana queda reabierta pero con los viajes enganchados a un
 * corte muerto, y nunca se puede volver a cerrar-- y que solo lo haga un admin.
 */
describe('SettlementsService undoDriverSettlement', () => {
  const ADMIN = { id: 'user-admin', rol: 'admin' } as never;
  const SEMANA = '2026-08-24';

  function armar(settlement: unknown) {
    const guardar = jest.fn((valor) => Promise.resolve(valor));
    const actualizarViajes = jest.fn().mockResolvedValue(undefined);
    const buscarSettlement = jest.fn().mockResolvedValue(settlement);

    const manager = {
      getRepository: jest.fn((entidad: { name?: string }) =>
        entidad?.name === 'Viajes'
          ? { update: actualizarViajes }
          : { findOne: buscarSettlement, save: guardar },
      ),
    };

    /*
     * Se construye por nombre y no por posicion, como el resto de los specs de
     * la casa. El registro entra como doble porque `Object.create` no ejecuta
     * los campos inicializados de la clase.
     */
    const service = Object.create(
      SettlementsService.prototype,
    ) as SettlementsService;
    Object.assign(service, {
      logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      dataSource: {
        transaction: (fn: (m: unknown) => unknown) => fn(manager),
      },
    });

    return { service, guardar, actualizarViajes };
  }

  const pagada = {
    id: 'corte-1',
    driverId: 'chofer-1',
    weekStart: SEMANA,
    status: 'paid',
    total: 1500,
  };

  it('reabre la semana y suelta los viajes que colgaban del corte', async () => {
    const { service, guardar, actualizarViajes } = armar(pagada);

    const reabierta = await service.undoDriverSettlement(
      'chofer-1',
      SEMANA,
      ADMIN,
      'Faltaba un viaje del sábado',
    );

    expect(actualizarViajes).toHaveBeenCalledWith(
      { driverSettlementId: 'corte-1' },
      { driverSettlementId: null },
    );
    expect(reabierta).toMatchObject({
      status: 'pending',
      paidAt: null,
      paidByUserId: null,
    });
    expect(guardar).toHaveBeenCalled();
  });

  /*
   * Deshacer mueve dinero en la direccion en la que un error cuesta caro, igual
   * que el de la modelo: por eso los dos son solo de admin.
   */
  it('un jefe no puede deshacerla', async () => {
    const { service, actualizarViajes } = armar(pagada);

    await expect(
      service.undoDriverSettlement(
        'chofer-1',
        SEMANA,
        {
          id: 'user-jefe',
          rol: 'jefe',
        } as never,
        'Un motivo suficientemente largo',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(actualizarViajes).not.toHaveBeenCalled();
  });

  it('no deshace una semana que nunca se pagó', async () => {
    const { service, actualizarViajes } = armar({
      ...pagada,
      status: 'pending',
    });

    await expect(
      service.undoDriverSettlement(
        'chofer-1',
        SEMANA,
        ADMIN,
        'Un motivo suficientemente largo',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(actualizarViajes).not.toHaveBeenCalled();
  });

  it('avisa si esa semana no tiene liquidación', async () => {
    const { service } = armar(null);

    await expect(
      service.undoDriverSettlement(
        'chofer-1',
        SEMANA,
        ADMIN,
        'Un motivo suficientemente largo',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
