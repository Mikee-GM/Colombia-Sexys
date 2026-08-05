import { BadRequestException } from '@nestjs/common';
import { ServicesService } from './services.service';

describe('ServicesService evidence listing', () => {
  const clauses: string[] = [];
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
    andWhere: jest.fn((clause: string) => {
      clauses.push(clause);
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

  it('rechaza cursores alterados', async () => {
    await expect(
      service.findEvidence(
        { id: 'admin', rol: 'admin' },
        { kind: 'transferencia', cursor: 'invalid' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
