import { ForbiddenException } from '@nestjs/common';
import { DisciplineService } from './discipline.service';

/**
 * Apelar una calificacion propia.
 *
 * Lo que importa aqui es de donde sale la identidad: si viniera del cliente de
 * la peticion, cualquiera podria apelar en nombre de otro, o pedir la lista de
 * calificaciones bajas de una companera. Sale siempre de la sesion.
 */
describe('DisciplineService apelaciones propias', () => {
  function armar(filas: Record<string, unknown>[] = [{ id: 'emp-1' }]) {
    const query = jest.fn().mockResolvedValue(filas);
    const appealRating = jest.fn().mockResolvedValue({ id: 'rating-1' });
    const listOwnAppealableRatings = jest.fn().mockResolvedValue([]);

    /*
     * Se construye por nombre y no por posicion: asi una dependencia nueva del
     * servicio no desplaza los dobles. El registro entra como doble porque
     * `Object.create` no ejecuta los campos inicializados de la clase.
     */
    const service = Object.create(
      DisciplineService.prototype,
    ) as DisciplineService;
    Object.assign(service, {
      logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      dataSource: { query },
    });

    // Los dos metodos de debajo son los que ya existian y se prueban aparte;
    // aqui solo se comprueba con que argumentos se les llama.
    service.appealRating = appealRating;
    service.listOwnAppealableRatings = listOwnAppealableRatings;

    return { service, appealRating, listOwnAppealableRatings, query };
  }

  it('apela con la identidad que sale de la sesion, no de la peticion', async () => {
    const { service, appealRating } = armar([{ id: 'emp-1' }]);

    await service.apelarPropia(
      { id: 'user-1', rol: 'empleada' } as never,
      'rating-1',
      'La cita se retraso porque el chofer no llego',
    );

    expect(appealRating).toHaveBeenCalledWith(
      'employee',
      'emp-1',
      'rating-1',
      'La cita se retraso porque el chofer no llego',
    );
  });

  it('resuelve al chofer contra su propia tabla', async () => {
    const { service, appealRating } = armar([{ id: 'chofer-1' }]);

    await service.apelarPropia(
      { id: 'user-2', rol: 'chofer' } as never,
      'rating-2',
      'El servicio se cancelo antes de que yo llegara',
    );

    expect(appealRating).toHaveBeenCalledWith(
      'driver',
      'chofer-1',
      'rating-2',
      expect.any(String),
    );
  });

  /*
   * Un jefe se resuelve como `boss`, y un `boss` no tiene calificaciones que
   * apelar. Sin este corte, `listOwnAppealableRatings` devolveria una lista
   * vacia y la pantalla ensenaria una tarjeta que no hace nada.
   */
  it('un jefe no tiene nada que apelar', async () => {
    const { service, appealRating } = armar();

    await expect(
      service.apelarPropia(
        { id: 'user-3', rol: 'jefe' } as never,
        'rating-3',
        'Un motivo suficientemente largo',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(appealRating).not.toHaveBeenCalled();
  });

  it('un usuario sin ficha de modelo ni de chofer tampoco', async () => {
    const { service, appealRating } = armar([]);

    await expect(
      service.apelarPropia(
        { id: 'user-4', rol: 'empleada' } as never,
        'rating-4',
        'Un motivo suficientemente largo',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(appealRating).not.toHaveBeenCalled();
  });

  it('la lista de apelables se pide solo para uno mismo', async () => {
    const { service, listOwnAppealableRatings } = armar([{ id: 'emp-9' }]);

    await service.listarApelablesPropias({
      id: 'user-9',
      rol: 'empleada',
    } as never);

    expect(listOwnAppealableRatings).toHaveBeenCalledWith('employee', 'emp-9');
  });
});
