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

  /*
   * Se construye por nombre y no por posicion.
   *
   * Con la lista posicional, cada dependencia nueva del servicio desplazaba
   * todos los dobles y las pruebas fallaban por un motivo ajeno a lo que
   * probaban. Paso cinco veces en una sola tanda de trabajo. El registro entra
   * como doble porque `Object.create` no ejecuta los campos inicializados de la
   * clase.
   */
  const service = Object.create(
    DriverShiftsService.prototype,
  ) as DriverShiftsService;
  Object.assign(service, {
    logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
    shifts,
    assignments,
    choferesRepository,
    // Los avisos push no intervienen en elegir candidatos.
    notifications: { notificar: jest.fn().mockResolvedValue(0) },
    dataSource,
    telegram: {},
  });

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

/**
 * Vista por chofer, para operar los turnos desde su ficha. Lo que importa es
 * que no ofrezca turnos que al asignarse fallarian: inactivos o llenos.
 */
describe('DriverShiftsService listShiftsForDriver', () => {
  const shifts = { find: jest.fn() };
  const assignments = { find: jest.fn(), createQueryBuilder: jest.fn() };
  const choferesRepository = { findOneBy: jest.fn() };

  const service = Object.create(
    DriverShiftsService.prototype,
  ) as DriverShiftsService;
  Object.assign(service, {
    logger: { error: jest.fn(), warn: jest.fn(), log: jest.fn() },
    shifts,
    assignments,
    choferesRepository,
    notifications: { notificar: jest.fn().mockResolvedValue(0) },
    dataSource: {},
    telegram: {},
  });

  function conteos(filas: Array<{ shiftId: string; count: number }>) {
    assignments.createQueryBuilder.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(filas),
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
    choferesRepository.findOneBy.mockResolvedValue({ id: 'chofer-1' });
  });

  it('separa lo que ya tiene de lo que puede tomar', async () => {
    shifts.find.mockResolvedValue([
      { id: 'mio', active: true, capacity: 3 },
      { id: 'libre', active: true, capacity: 3 },
    ]);
    assignments.find.mockResolvedValue([{ shiftId: 'mio' }]);
    conteos([{ shiftId: 'mio', count: 1 }]);

    const result = await service.listShiftsForDriver('chofer-1');

    expect(result.assigned.map((s) => s.id)).toEqual(['mio']);
    expect(result.available.map((s) => s.id)).toEqual(['libre']);
  });

  it('no ofrece un turno lleno, porque asignarlo daria conflicto', async () => {
    shifts.find.mockResolvedValue([{ id: 'lleno', active: true, capacity: 2 }]);
    assignments.find.mockResolvedValue([]);
    conteos([{ shiftId: 'lleno', count: 2 }]);

    const result = await service.listShiftsForDriver('chofer-1');

    expect(result.available).toEqual([]);
  });

  it('no ofrece un turno desactivado', async () => {
    shifts.find.mockResolvedValue([
      { id: 'apagado', active: false, capacity: null },
    ]);
    assignments.find.mockResolvedValue([]);
    conteos([]);

    const result = await service.listShiftsForDriver('chofer-1');

    expect(result.available).toEqual([]);
  });

  it('ofrece un turno sin tope aunque ya tenga gente', async () => {
    shifts.find.mockResolvedValue([
      { id: 'sin-tope', active: true, capacity: null },
    ]);
    assignments.find.mockResolvedValue([]);
    conteos([{ shiftId: 'sin-tope', count: 9 }]);

    const result = await service.listShiftsForDriver('chofer-1');

    expect(result.available.map((s) => s.id)).toEqual(['sin-tope']);
    expect(result.available[0].assignedCount).toBe(9);
  });

  it('falla si el chofer no existe', async () => {
    choferesRepository.findOneBy.mockResolvedValue(null);

    await expect(service.listShiftsForDriver('fantasma')).rejects.toThrow(
      'Chofer no encontrado',
    );
  });
});
