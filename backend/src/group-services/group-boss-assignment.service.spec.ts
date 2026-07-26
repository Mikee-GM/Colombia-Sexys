import { ConflictException } from '@nestjs/common';
import { GroupBossAssignmentService } from './group-boss-assignment.service';

describe('GroupBossAssignmentService', () => {
  function setup(options?: {
    balancedBosses?: Array<{ id: string }>;
    admin?: { id: string } | null;
    employee?: any;
  }) {
    const userRepository = {
      findOne: jest.fn().mockResolvedValue(options?.admin ?? null),
    };
    const employeeRepository = {
      findOne: jest.fn().mockResolvedValue(options?.employee ?? null),
    };
    const dataSource = {
      query: jest.fn().mockResolvedValue(options?.balancedBosses ?? []),
      getRepository: jest.fn((entity: { name: string }) =>
        entity.name === 'Empleadas' ? employeeRepository : userRepository,
      ),
    };
    return {
      service: new GroupBossAssignmentService(dataSource as any),
      dataSource,
      userRepository,
    };
  }

  it('usa el jefe de la empleada inicial cuando está operativo', async () => {
    const { service, dataSource } = setup({
      employee: {
        jefe: { id: 'assigned-boss', activo: true, disponible: true },
        jefeSecundario: null,
      },
      balancedBosses: [{ id: 'balanced-boss' }],
    });

    await expect(service.resolve('employee-id')).resolves.toBe(
      'assigned-boss',
    );
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('selecciona el primer jefe devuelto por el balance determinista', async () => {
    const { service, dataSource } = setup({
      balancedBosses: [{ id: 'least-loaded-boss' }],
    });

    await expect(service.resolve()).resolves.toBe('least-loaded-boss');
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY COUNT(DISTINCT CASE'),
    );
  });

  it('usa un administrador activo cuando no hay jefes disponibles', async () => {
    const { service } = setup({ admin: { id: 'admin-id' } });
    await expect(service.resolve()).resolves.toBe('admin-id');
  });

  it('falla claramente cuando no existe ningún responsable', async () => {
    const { service } = setup();
    await expect(service.resolve()).rejects.toBeInstanceOf(ConflictException);
  });
});
