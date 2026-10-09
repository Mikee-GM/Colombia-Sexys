import { ForbiddenException } from '@nestjs/common';
import { ServiceHistoryService } from './service-history.service';

describe('ServiceHistoryService permisos', () => {
  const builder = {
    leftJoinAndSelect: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    orderBy: jest.fn(),
    getMany: jest.fn().mockResolvedValue([]),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    for (const key of ['leftJoinAndSelect', 'where', 'andWhere', 'orderBy']) {
      builder[key].mockReturnValue(builder);
    }
  });

  function subject(
    input: {
      employee?: any;
      employeeExists?: boolean;
      visibleEmployees?: any[];
    } = {},
  ) {
    const services = { createQueryBuilder: jest.fn(() => builder) };
    const employees = {
      findOne: jest.fn().mockResolvedValue(input.employee ?? null),
      exists: jest.fn().mockResolvedValue(input.employeeExists ?? false),
      find: jest.fn().mockResolvedValue(input.visibleEmployees ?? []),
    };
    const audit = {};
    return {
      service: new ServiceHistoryService(
        services as any,
        employees as any,
        audit as any,
      ),
      employees,
    };
  }

  it('la empleada queda forzada a sus propios servicios', async () => {
    const { service } = subject({
      employee: { id: 'employee-own', usuarioId: 'user-1' },
      visibleEmployees: [],
    });
    const result = await service.weekly(
      { id: 'user-1', rol: 'empleada' } as any,
      { weekStart: undefined, employeeId: 'employee-other' },
    );
    expect(result.selectedEmployeeId).toBe('employee-own');
    expect(builder.andWhere).toHaveBeenCalledWith(
      'service.empleadaId = :employeeId',
      { employeeId: 'employee-own' },
    );
  });

  it('el jefe no puede pedir una empleada ajena', async () => {
    const { service } = subject({ employeeExists: false });
    await expect(
      service.weekly({ id: 'boss-1', rol: 'jefe' } as any, {
        employeeId: 'employee-other',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('el jefe siempre recibe filtro de equipo en la consulta', async () => {
    const { service } = subject();
    await service.weekly({ id: 'boss-1', rol: 'jefe' } as any, {});
    expect(builder.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('employee.jefeId = :actorId'),
      { actorId: 'boss-1' },
    );
  });

  it('admin puede consultar todos sin filtro de equipo', async () => {
    const { service } = subject();
    await service.weekly({ id: 'admin-1', rol: 'admin' } as any, {});
    expect(builder.andWhere).not.toHaveBeenCalledWith(
      expect.stringContaining('employee.jefeId = :actorId'),
      expect.anything(),
    );
  });
});
