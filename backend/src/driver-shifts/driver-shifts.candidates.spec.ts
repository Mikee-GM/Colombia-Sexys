import { DriverShiftsService } from './driver-shifts.service';

/**
 * Elegibilidad para un turno.
 *
 * Asignar un turno es planear la semana, no repartir el viaje de ahora. El
 * filtro tomaba `disponible`, que es estado de despacho y nace en `false`, asi
 * que la lista de candidatos salia vacia y el turno no se le podia dar a nadie.
 */
describe('DriverShiftsService listCandidates', () => {
  const shifts = { findOneBy: jest.fn() };
  const assignments = { find: jest.fn() };
  const choferesRepository = { find: jest.fn() };
  const dataSource = { query: jest.fn() };

  const service = new DriverShiftsService(
    shifts as any,
    assignments as any,
    choferesRepository as any,
    dataSource as any,
    {} as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    shifts.findOneBy.mockResolvedValue({ id: 'turno', capacity: 3 });
    assignments.find.mockResolvedValue([]);
    // Primera consulta: sanciones vigentes. Segunda: el score de cada chofer.
    dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: 'ocupado', nombre: 'Ocupado', score: '80' },
      { id: 'libre', nombre: 'Libre', score: '60' },
    ]);
    choferesRepository.find.mockResolvedValue([
      { id: 'ocupado', nombre: 'Ocupado', disponible: false },
      { id: 'libre', nombre: 'Libre', disponible: true },
    ]);
  });

  it('ofrece tambien a los choferes que ahora mismo estan ocupados', async () => {
    const result = await service.listCandidates('turno');

    expect(result.candidates.map((c) => c.id)).toEqual(['ocupado', 'libre']);
    expect(choferesRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { usuario: { activo: true } } }),
    );
  });

  it('marca el estado de despacho sin usarlo para filtrar', async () => {
    const result = await service.listCandidates('turno');

    expect(result.candidates).toEqual([
      expect.objectContaining({ id: 'ocupado', disponible: false }),
      expect.objectContaining({ id: 'libre', disponible: true }),
    ]);
  });

  it('deja fuera al chofer con una sancion vigente', async () => {
    dataSource.query.mockReset();
    dataSource.query
      .mockResolvedValueOnce([{ subject_id: 'ocupado' }])
      .mockResolvedValueOnce([{ id: 'libre', nombre: 'Libre', score: '60' }]);

    const result = await service.listCandidates('turno');

    expect(result.candidates.map((c) => c.id)).toEqual(['libre']);
  });

  it('no vuelve a ofrecer a quien ya esta asignado', async () => {
    assignments.find.mockResolvedValue([{ driverId: 'libre' }]);
    dataSource.query.mockReset();
    dataSource.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: 'ocupado', nombre: 'Ocupado', score: '80' },
      ]);

    const result = await service.listCandidates('turno');

    expect(result.candidates.map((c) => c.id)).toEqual(['ocupado']);
    expect(result.assignedCount).toBe(1);
  });
});
