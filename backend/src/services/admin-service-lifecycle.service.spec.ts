import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AdminServiceLifecycleService } from './admin-service-lifecycle.service';

describe('AdminServiceLifecycleService', () => {
  const ADMIN = { id: 'admin-1', rol: 'admin' } as any;

  function setup(status = 'en_curso', operationalState = 'en_curso') {
    const current: any = {
      id: '11111111-1111-4111-8111-111111111111',
      estado: status,
      operationalState,
      serviceType: 'individual',
      empleadaId: 'employee-1',
      jefeId: 'boss-1',
      deletedAt: null,
      administrativeVoidAt: null,
      administrativeReviewRequired: false,
      serviceBaseAmountSnapshot: 2000,
      employeePercentageSnapshot: 60,
      totalBase: 2000,
      totalExtras: 0,
      totalTransporte: 100,
      customerTransportCharge: 100,
      totalFinal: 2100,
      empleada: { usuarioId: 'employee-user' },
      viajes: [],
      extrasServicios: [],
      extensionesServicios: [],
    };
    const serviceBuilder = {
      setLock: jest.fn(),
      where: jest.fn(),
      getOne: jest.fn().mockResolvedValue(current),
    } as any;
    serviceBuilder.setLock.mockReturnValue(serviceBuilder);
    serviceBuilder.where.mockReturnValue(serviceBuilder);
    const serviceRepo = {
      createQueryBuilder: jest.fn(() => serviceBuilder),
      save: jest.fn((value) => Promise.resolve(value)),
      exists: jest.fn().mockResolvedValue(false),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const tripRepo = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
      exists: jest.fn().mockResolvedValue(false),
    };
    const employeeRepo = { update: jest.fn() };
    const liquidationRepo = { update: jest.fn() };
    const cashRepo = { update: jest.fn() };
    const auditRepo = {
      create: jest.fn((value) => value),
      save: jest.fn((value) => Promise.resolve(value)),
    };
    const manager: any = {
      getRepository: jest.fn((entity) => {
        const name = entity?.name;
        if (name === 'Servicios') return serviceRepo;
        if (name === 'Viajes') return tripRepo;
        if (name === 'Empleadas') return employeeRepo;
        if (name === 'LiquidationRecord') return liquidationRepo;
        if (name === 'EmployeeCashObligation') return cashRepo;
        if (name === 'ServiceAdminAudit') return auditRepo;
        throw new Error(`Repositorio inesperado ${name}`);
      }),
      query: jest.fn((sql: string) => {
        if (sql.includes('SELECT id FROM viajes')) return Promise.resolve([]);
        if (sql.includes('SELECT')) return Promise.resolve([{}]);
        return Promise.resolve([]);
      }),
    };
    const repositories = {
      services: {
        findOne: jest.fn().mockResolvedValue(current),
      },
      audit: auditRepo,
    };
    const operational = {
      cancel: jest.fn(() => {
        current.estado = 'cancelado';
        current.operationalState = 'cancelado';
        current.canceladoAt = new Date();
        return Promise.resolve();
      }),
    };
    const realtime = {
      emitToBoss: jest.fn(),
      emitToEmployee: jest.fn(),
      emitToDriver: jest.fn(),
      emitToJefes: jest.fn(),
    };
    const notifications = { notificar: jest.fn().mockResolvedValue(0) };
    const service = new AdminServiceLifecycleService(
      { transaction: (fn: any) => fn(manager) } as any,
      repositories.services as any,
      repositories.audit as any,
      operational as any,
      realtime as any,
      notifications as any,
    );
    return {
      service,
      current,
      operational,
      auditRepo,
      manager,
      serviceRepo,
      tripRepo,
      employeeRepo,
      liquidationRepo,
      cashRepo,
      realtime,
      notifications,
    };
  }

  it.each([
    'preparacion',
    'preparado',
    'asignado',
    'esperando_aceptacion_empleada',
    'aceptado',
    'esperando_transporte_ida',
    'transporte_ida_asignado',
    'empleada_en_camino',
    'empleada_llego',
    'en_curso',
    'preparando_regreso',
    'transporte_regreso_asignado',
    'empleada_de_regreso',
  ])('cancela de forma administrativa desde %s', async (operationalState) => {
    const { service, current } = setup('en_curso', operationalState);
    const result = await service.administrativelyCancel(
      current.id,
      ADMIN,
      'Correccion administrativa comprobada',
    );
    expect(result.changed).toBe(true);
    expect(current.estado).toBe('cancelado');
    expect(current.operationalState).toBe('cancelado');
    expect(current.administrativeVoidByUserId).toBe(ADMIN.id);
  });

  it('anula un finalizado sin reutilizar cancelacion operacional', async () => {
    const { service, current, operational, auditRepo } = setup(
      'finalizado',
      'finalizado',
    );
    await service.administrativelyCancel(
      current.id,
      ADMIN,
      'Servicio finalizado capturado por error',
    );
    expect(operational.cancel).not.toHaveBeenCalled();
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'voided' }),
    );
  });

  it('es idempotente si ya fue anulado', async () => {
    const { service, current, operational } = setup();
    current.administrativeVoidAt = new Date();
    await expect(
      service.administrativelyCancel(
        current.id,
        ADMIN,
        'Segundo intento administrativo',
      ),
    ).resolves.toEqual({ changed: false, serviceId: current.id });
    expect(operational.cancel).not.toHaveBeenCalled();
  });

  it('rechaza a un jefe aunque conozca el identificador', async () => {
    const { service, current } = setup();
    await expect(
      service.administrativelyCancel(
        current.id,
        { id: 'boss-1', rol: 'jefe' } as any,
        'Intento no autorizado',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('mueve a papelera con motivo, estado previo y auditoria sin borrar la fila', async () => {
    const { service, current, serviceRepo, auditRepo } = setup();

    await expect(
      service.softDelete(
        current.id,
        ADMIN,
        'Registro duplicado confirmado por administracion',
      ),
    ).resolves.toEqual({ changed: true, serviceId: current.id });

    expect(current.deletedAt).toBeInstanceOf(Date);
    expect(current.deletedByUserId).toBe(ADMIN.id);
    expect(current.previousStatus).toBe('en_curso');
    expect(current.previousOperationalState).toBe('en_curso');
    expect(serviceRepo.delete).not.toHaveBeenCalled();
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'soft_deleted' }),
    );
  });

  it('restaura siempre en revision sin reactivar recursos', async () => {
    const { service, current, operational, realtime } = setup(
      'cancelado',
      'cancelado',
    );
    current.deletedAt = new Date();

    await expect(
      service.restore(
        current.id,
        ADMIN,
        'Revisar el registro restaurado antes de operar',
      ),
    ).resolves.toEqual({
      changed: true,
      serviceId: current.id,
      reviewRequired: true,
    });

    expect(current.deletedAt).toBeNull();
    expect(current.estado).toBe('cancelado');
    expect(current.operationalState).toBe('cancelado');
    expect(current.administrativeReviewRequired).toBe(true);
    expect(operational.cancel).not.toHaveBeenCalled();
    expect(realtime.emitToJefes).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'service_restored_for_review' }),
    );
  });

  it('exige confirmacion literal para eliminar definitivamente', async () => {
    const { service, current, serviceRepo } = setup('cancelado', 'cancelado');
    current.deletedAt = new Date();

    await expect(
      service.hardDelete(
        current.id,
        ADMIN,
        'Depuracion definitiva aprobada por administracion',
        'eliminar',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(serviceRepo.delete).not.toHaveBeenCalled();
  });

  it('preserva referencias historicas antes del hard delete transaccional', async () => {
    const { service, current, serviceRepo, manager, auditRepo } = setup(
      'cancelado',
      'cancelado',
    );
    current.deletedAt = new Date();

    await expect(
      service.hardDelete(
        current.id,
        ADMIN,
        'Depuracion definitiva aprobada por administracion',
        'ELIMINAR',
      ),
    ).resolves.toEqual({ deleted: true, serviceId: current.id });

    const executedSql = manager.query.mock.calls
      .map(([sql]: [string]) => sql)
      .join('\n');
    expect(executedSql).toContain('UPDATE conversaciones_telegram');
    expect(executedSql).toContain('UPDATE liquidation_records');
    expect(executedSql).toContain('UPDATE interaction_ratings');
    expect(executedSql).toContain('UPDATE customer_booking_sessions');
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'hard_deleted' }),
    );
    expect(serviceRepo.delete).toHaveBeenCalledWith(current.id);
  });

  it('cancela viajes conservando costos y libera chofer y empleada sin obligaciones activas', async () => {
    const { service, current, tripRepo, employeeRepo, manager, realtime } =
      setup();
    const trip = {
      id: 'trip-1',
      choferId: 'driver-1',
      costo: 480,
      estado: 'asignado',
    };
    tripRepo.find.mockResolvedValue([trip]);

    await service.administrativelyCancel(
      current.id,
      ADMIN,
      'Cancelacion con transporte ya gastado y comprobado',
    );

    expect(tripRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ servicioId: current.id }),
      { estado: 'cancelado', ofertaExpiraEn: null },
    );
    expect(trip.costo).toBe(480);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE choferes SET disponible = true'),
      ['driver-1'],
    );
    expect(employeeRepo.update).toHaveBeenCalledWith('employee-1', {
      disponible: true,
    });
    expect(realtime.emitToDriver).toHaveBeenCalledWith(
      'driver-1',
      expect.objectContaining({ type: 'trip_cancelled' }),
    );
  });

  it('cancela participantes grupales y libera a todas las empleadas', async () => {
    const { service, current, operational, manager, employeeRepo } = setup();
    current.serviceType = 'grupal';
    manager.query.mockImplementation((sql: string) => {
      if (sql.includes('SELECT DISTINCT "employee_id"')) {
        return Promise.resolve([{ employeeId: 'employee-2' }]);
      }
      if (sql.includes('SELECT id FROM viajes')) return Promise.resolve([]);
      if (sql.includes('SELECT')) return Promise.resolve([{}]);
      return Promise.resolve([]);
    });

    await service.administrativelyCancel(
      current.id,
      ADMIN,
      'Cancelacion administrativa del servicio grupal',
    );

    expect(operational.cancel).not.toHaveBeenCalled();
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE service_participants'),
      [current.id],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE group_service_requests'),
      [current.id],
    );
    expect(employeeRepo.update).toHaveBeenCalledWith('employee-1', {
      disponible: true,
    });
    expect(employeeRepo.update).toHaveBeenCalledWith('employee-2', {
      disponible: true,
    });
  });

  it('no repite efectos al intentar borrar dos veces', async () => {
    const { service, current, operational } = setup('cancelado', 'cancelado');
    current.deletedAt = new Date();

    await expect(
      service.softDelete(
        current.id,
        ADMIN,
        'Segundo intento sobre un servicio ya eliminado',
      ),
    ).resolves.toEqual({ changed: false, serviceId: current.id });
    expect(operational.cancel).not.toHaveBeenCalled();
  });
});
