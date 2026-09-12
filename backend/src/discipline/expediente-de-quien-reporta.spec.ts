import { DisciplineService } from './discipline.service';

/**
 * El expediente tiene que contar las dos mitades.
 *
 * Miraba solo lo que le habian puesto a la persona, y en un cliente la otra
 * mitad es la que mas dice: un reporte suyo se lee distinto si es el primero en
 * un año que si es el cuarto contra una modelo distinta cada vez, todos
 * desestimados. Sin esto habia que recorrer la lista general reporte por
 * reporte para darse cuenta.
 */
describe('DisciplineService: lo que ha reportado una persona', () => {
  function armar() {
    const query = jest.fn().mockResolvedValue([]);
    const reports = { find: jest.fn().mockResolvedValue([]) };
    const sanctions = { find: jest.fn().mockResolvedValue([]) };

    const service = Object.create(
      DisciplineService.prototype,
    ) as DisciplineService;
    Object.assign(service, {
      logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
      dataSource: { query },
      reports,
      sanctions,
    });
    (service as any).ratingSummary = jest.fn().mockResolvedValue([]);

    return { service, query, reports };
  }

  const hecho = (extra: Record<string, unknown> = {}) => ({
    id: 'rep-1',
    category: 'trato_inadecuado',
    description: 'Fue grosera',
    status: 'cerrado',
    outcome: 'no_sustentado',
    priority: 'normal',
    createdAt: new Date(),
    subjectType: 'employee',
    subjectId: 'emp-1',
    serviceId: 'srv-1',
    subjectName: 'Ana',
    ...extra,
  });

  it('trae lo que el cliente ha reportado, con el nombre de cada reportada', async () => {
    const { service, query } = armar();
    query.mockResolvedValue([hecho()]);

    const expediente: any = await service.getDossier(
      { id: 'admin-1', rol: 'admin' },
      'client',
      'cli-1',
    );

    expect(query).toHaveBeenCalledWith(expect.any(String), ['client', 'cli-1']);
    expect(expediente.reportsMade[0].subjectName).toBe('Ana');
  });

  /*
   * Contra cuantas personas distintas es el numero que decide: diez reportes
   * contra la misma persona son un conflicto entre dos; diez contra diez
   * describen a quien reporta, no a los reportados.
   */
  it('resume cuantos prosperaron y contra cuanta gente distinta van', async () => {
    const { service, query } = armar();
    query.mockResolvedValue([
      hecho({ id: 'r1', subjectId: 'emp-1', outcome: 'no_sustentado' }),
      hecho({ id: 'r2', subjectId: 'emp-2', outcome: 'no_sustentado' }),
      hecho({ id: 'r3', subjectId: 'emp-3', outcome: 'confirmado' }),
      hecho({ id: 'r4', subjectId: 'emp-1', outcome: null, status: 'nuevo' }),
    ]);

    const expediente: any = await service.getDossier(
      { id: 'admin-1', rol: 'admin' },
      'client',
      'cli-1',
    );

    expect(expediente.reportsMadeSummary).toEqual({
      total: 4,
      confirmados: 1,
      desestimados: 2,
      abiertos: 1,
      personasDistintas: 3,
    });
  });

  it('un jefe no levanta reportes, asi que no se le preguntan', async () => {
    const { service, query } = armar();

    const expediente: any = await service.getDossier(
      { id: 'admin-1', rol: 'admin' },
      'boss',
      'jefe-1',
    );

    expect(expediente.reportsMade).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
