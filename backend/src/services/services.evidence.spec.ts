import { BadRequestException } from '@nestjs/common';
import { ServicesService } from './services.service';

describe('ServicesService evidence listing', () => {
  const clauses: string[] = [];
  /** Parametros de cada andWhere, para comprobar los limites del periodo. */
  const params: Record<string, unknown> = {};
  const rows = [
    {
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      imageUrl: 'https://media.example.com/new.jpg',
      estado: 'APROBADO',
      createdAt: new Date('2026-08-03T12:00:00.000Z'),
      servicioId: 'service-1',
      monto: 500,
      observaciones: null,
      servicio: { cliente: { nombreTelegram: 'Cliente' } },
    },
    {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      imageUrl: 'https://media.example.com/old.jpg',
      estado: 'RECHAZADO',
      createdAt: new Date('2026-08-03T11:00:00.000Z'),
      servicioId: 'service-2',
      monto: 400,
      observaciones: 'Monto incorrecto',
      servicio: { cliente: { nombreTelegram: 'Otro cliente' } },
    },
  ];
  const queryBuilder: any = {
    leftJoinAndSelect: jest.fn(() => queryBuilder),
    leftJoin: jest.fn(() => queryBuilder),
    where: jest.fn(() => queryBuilder),
    andWhere: jest.fn((clause: string, valores?: Record<string, unknown>) => {
      clauses.push(clause);
      Object.assign(params, valores ?? {});
      return queryBuilder;
    }),
    orderBy: jest.fn(() => queryBuilder),
    addOrderBy: jest.fn(() => queryBuilder),
    take: jest.fn(() => queryBuilder),
    getMany: jest.fn(() => Promise.resolve(rows)),
  };
  const service = Object.create(ServicesService.prototype);
  service.paymentReceiptValidationsRepository = {
    createQueryBuilder: jest.fn(() => queryBuilder),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    clauses.length = 0;
    for (const clave of Object.keys(params)) delete params[clave];
  });

  it('limita al jefe a evidencias de servicios asignados y devuelve cursor', async () => {
    const result = await service.findEvidence(
      { id: 'boss', rol: 'jefe' },
      { kind: 'transferencia', limit: 1 },
    );

    expect(clauses.some((clause) => clause.includes('employee.jefeId'))).toBe(
      true,
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        kind: 'transferencia',
        status: 'APROBADO',
        serviceId: 'service-1',
      }),
    );
    expect(result.nextCursor).toEqual(expect.any(String));
  });

  /**
   * El corte de una empleada pide sus comprobantes con estos filtros. Si el de
   * empleada mirara solo al titular del servicio, los servicios en grupo --los
   * que mas comprobantes acumulan-- se quedarian fuera de su corte.
   */
  it('acota por empleada contando tambien los servicios en grupo', async () => {
    await service.findEvidence(
      { id: 'admin', rol: 'admin' },
      { kind: 'transferencia', employeeId: 'emp-1' },
    );

    const porEmpleada = clauses.find((clause) =>
      clause.includes('service.empleadaId = :employeeId'),
    );
    expect(porEmpleada).toBeDefined();
    expect(porEmpleada).toContain('service_participants');
    expect(params.employeeId).toBe('emp-1');
  });

  it('toma el periodo en UTC y con el ultimo dia completo', async () => {
    await service.findEvidence(
      { id: 'admin', rol: 'admin' },
      { kind: 'transferencia', from: '2026-08-17', to: '2026-08-23' },
    );

    expect((params.desde as Date).toISOString()).toBe(
      '2026-08-17T00:00:00.000Z',
    );
    // Inclusivo: un comprobante de la noche del ultimo dia pertenece al corte.
    expect((params.hasta as Date).toISOString()).toBe(
      '2026-08-23T23:59:59.999Z',
    );
  });

  it('ignora un periodo ilegible en vez de reventar la consulta', async () => {
    await service.findEvidence(
      { id: 'admin', rol: 'admin' },
      { kind: 'transferencia', from: 'la semana pasada' },
    );

    expect(clauses.some((clause) => clause.includes('>= :desde'))).toBe(false);
  });

  it('rechaza cursores alterados', async () => {
    await expect(
      service.findEvidence(
        { id: 'admin', rol: 'admin' },
        { kind: 'transferencia', cursor: 'invalid' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
