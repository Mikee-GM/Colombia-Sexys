import { ConflictException, ForbiddenException } from '@nestjs/common';
import { EmployeeReportsService } from './employee-reports.service';

describe('EmployeeReportsService', () => {
  const buildService = (repositories: any = {}) => {
    const dataSource = {
      getRepository: jest.fn((entity: any) => repositories[entity.name]),
    } as any;
    return new EmployeeReportsService({} as any, {} as any, dataSource);
  };

  it('maps category to the agreed automatic priority', () => {
    const service = buildService() as any;
    expect(service.priorityFor('seguridad')).toBe('urgente');
    expect(service.priorityFor('cobro')).toBe('alta');
    expect(service.priorityFor('incumplimiento')).toBe('alta');
    expect(service.priorityFor('trato_inadecuado')).toBe('normal');
  });

  it('rejects a client attempting to report another client service', async () => {
    const service = buildService({
      Clientes: { findOne: jest.fn().mockResolvedValue({ id: 'client-1' }) },
      Servicios: {
        findOne: jest
          .fn()
          .mockResolvedValue({ id: 'service-1', clienteId: 'client-2' }),
      },
    });
    await expect(
      service.createFromClient(
        '123',
        'service-1',
        'otro',
        'Descripción válida',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects reports after the 24 hour window', () => {
    const service = buildService() as any;
    const expired = new Date(Date.now() - 24 * 60 * 60 * 1000 - 1);
    expect(() => service.assertWithinWindow(expired, 'El servicio')).toThrow(
      ConflictException,
    );
  });

  it('does not expose another boss report', async () => {
    const reports = {
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'report-1', bossId: 'boss-2' }),
    };
    /*
     * Se construye por nombre y no con `new`.
     *
     * Con la lista posicional, cada dependencia nueva del servicio desplazaba todos
     * los dobles y estas pruebas fallaban por un motivo ajeno a lo que probaban.
     * Los campos inicializados de la clase entran como dobles porque
     * `Object.create` no los ejecuta.
     */
    const service = Object.create(
      EmployeeReportsService.prototype,
    ) as EmployeeReportsService;
    Object.assign(service, {
      reports,
      history: {},
      dataSource: {},
    });
    await expect(
      service.findOne('report-1', { id: 'boss-1', rol: 'jefe' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('activates tolerance exactly at 3 reports and 5 extensions', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([
        {
          employeeId: 'employee-1',
          employeeName: 'Empleada',
          reports90Days: 3,
          reportsHistorical: 3,
          extensions30Days: 5,
          extensionsHistorical: 5,
        },
      ]),
    };
    /*
     * Se construye por nombre y no con `new`.
     *
     * Con la lista posicional, cada dependencia nueva del servicio desplazaba todos
     * los dobles y estas pruebas fallaban por un motivo ajeno a lo que probaban.
     * Los campos inicializados de la clase entran como dobles porque
     * `Object.create` no los ejecuta.
     */
    const service = Object.create(
      EmployeeReportsService.prototype,
    ) as EmployeeReportsService;
    Object.assign(service, {
      reports: {},
      history: {},
      dataSource,
    });
    const [metric] = await service.tolerance({ rol: 'admin' } as any);
    expect(metric.reportsOverTolerance).toBe(true);
    expect(metric.extensionsOverTolerance).toBe(true);
  });
});
