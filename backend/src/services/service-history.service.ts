import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuarios } from '../users/entities/user.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { Servicios } from './entities/service.entity';
import {
  assertEmployeeWeekAllowed,
  resolveBusinessWeek,
} from './business-week';
import {
  calculateServiceFinancials,
  type CardExtraSnapshot,
} from './service-financial-calculator';
import { ServiceAdminAudit } from './entities/service-admin-audit.entity';

export type WeeklyHistoryRow = ReturnType<ServiceHistoryService['mapService']>;

@Injectable()
export class ServiceHistoryService {
  constructor(
    @InjectRepository(Servicios)
    private readonly services: Repository<Servicios>,
    @InjectRepository(Empleadas)
    private readonly employees: Repository<Empleadas>,
    @InjectRepository(ServiceAdminAudit)
    private readonly audit: Repository<ServiceAdminAudit>,
  ) {}

  async weekly(
    actor: Usuarios,
    query: { weekStart?: string; employeeId?: string },
  ) {
    const week = resolveBusinessWeek(query.weekStart);
    let employeeId = query.employeeId?.trim() || undefined;

    if (actor.rol === 'empleada') {
      assertEmployeeWeekAllowed(week);
      const employee = await this.employees.findOne({
        where: { usuarioId: actor.id },
      });
      if (!employee)
        throw new ForbiddenException('Perfil de empleada no encontrado');
      employeeId = employee.id;
    } else if (actor.rol === 'jefe' && employeeId) {
      const allowed = await this.employees.exists({
        where: [
          { id: employeeId, jefeId: actor.id },
          { id: employeeId, jefeSecundarioId: actor.id },
        ],
      });
      if (!allowed)
        throw new ForbiddenException('Esa empleada no pertenece a tu equipo');
    }

    const builder = this.services
      .createQueryBuilder('service')
      .leftJoinAndSelect('service.empleada', 'employee')
      .leftJoinAndSelect('employee.jefe', 'employeeBoss')
      .leftJoinAndSelect('service.cliente', 'client')
      .leftJoinAndSelect('service.extensionesServicios', 'extensions')
      .leftJoinAndSelect('service.extrasServicios', 'extras')
      .where('service.deletedAt IS NULL')
      .andWhere(
        'COALESCE(service.horaFinServicio, service.canceladoAt, service.fechaProgramada, service.createdAt) >= :from',
        { from: week.from },
      )
      .andWhere(
        'COALESCE(service.horaFinServicio, service.canceladoAt, service.fechaProgramada, service.createdAt) < :to',
        { to: week.toExclusive },
      )
      .orderBy(
        'COALESCE(service.horaFinServicio, service.canceladoAt, service.fechaProgramada, service.createdAt)',
        'DESC',
      );

    if (actor.rol === 'jefe') {
      builder.andWhere(
        '(service.jefeId = :actorId OR employee.jefeId = :actorId OR employee.jefeSecundarioId = :actorId)',
        { actorId: actor.id },
      );
    }
    if (employeeId)
      builder.andWhere('service.empleadaId = :employeeId', { employeeId });

    const services = await builder.getMany();
    const rows = services.map((service) => this.mapService(service));
    const visibleEmployees = await this.visibleEmployees(actor);

    return {
      week: {
        startDate: week.startDate,
        endDate: week.endDate,
        previousStart: week.previousStart,
        nextStart: week.nextStart,
        canGoNext: actor.rol !== 'empleada' || !week.isCurrent,
      },
      selectedEmployeeId: employeeId ?? null,
      employees: visibleEmployees.map((employee) => ({
        id: employee.id,
        name: employee.nombreArtistico,
        bossId: employee.jefeId,
        bossName: employee.jefe
          ? [employee.jefe.nombre, employee.jefe.apellido]
              .filter(Boolean)
              .join(' ') || employee.jefe.email
          : null,
      })),
      rows,
      summary: this.buildSummary(rows),
    };
  }

  async trash(actor: Usuarios) {
    if (actor.rol !== 'admin')
      throw new ForbiddenException('Solo administracion puede ver la papelera');
    // El builder deja explicito que esta consulta solo contiene la papelera.
    const deleted = await this.services
      .createQueryBuilder('service')
      .leftJoinAndSelect('service.empleada', 'employee')
      .leftJoinAndSelect('service.cliente', 'client')
      .where('service.deletedAt IS NOT NULL')
      .orderBy('service.deletedAt', 'DESC')
      .getMany();
    const audits = deleted.length
      ? await this.audit
          .createQueryBuilder('audit')
          .where('audit.serviceId IN (:...ids)', {
            ids: deleted.map((service) => service.id),
          })
          .orderBy('audit.createdAt', 'DESC')
          .getMany()
      : [];
    const actorByService = new Map<string, ServiceAdminAudit>();
    for (const entry of audits) {
      if (
        !actorByService.has(entry.serviceId) &&
        entry.action === 'soft_deleted'
      ) {
        actorByService.set(entry.serviceId, entry);
      }
    }
    return deleted.map((service) => ({
      id: service.id,
      folio: this.folio(service.id),
      employeeName: service.empleada?.nombreArtistico ?? 'Sin empleada',
      clientName:
        service.cliente?.nombreTelegram ??
        service.clienteNombreLibre ??
        'Sin cliente',
      serviceDate: this.serviceDate(service).toISOString(),
      previousStatus: service.previousStatus,
      previousOperationalState: service.previousOperationalState,
      deletedAt: service.deletedAt?.toISOString() ?? null,
      deletedByUserId: service.deletedByUserId,
      deleteReason: service.deleteReason,
      actorRole: actorByService.get(service.id)?.actorRole ?? null,
    }));
  }

  private async visibleEmployees(actor: Usuarios) {
    if (actor.rol === 'empleada') {
      return this.employees.find({
        where: { usuarioId: actor.id },
        relations: { jefe: true },
      });
    }
    if (actor.rol === 'jefe') {
      return this.employees.find({
        where: [{ jefeId: actor.id }, { jefeSecundarioId: actor.id }],
        relations: { jefe: true },
        order: { nombreArtistico: 'ASC' },
      });
    }
    if (actor.rol !== 'admin')
      throw new ForbiddenException('Rol sin historial financiero');
    return this.employees.find({
      relations: { jefe: true },
      order: { nombreArtistico: 'ASC' },
    });
  }

  private mapService(service: Servicios) {
    if (!service.empleada)
      throw new NotFoundException(
        `El servicio ${service.id} no tiene empleada`,
      );
    const cardExtras: CardExtraSnapshot[] = (service.extrasServicios ?? [])
      .filter((extra) => extra.metodoPago === 'tarjeta')
      .map((extra) => ({
        amount: Number(extra.precioCobrado),
        companyPercentage: Number(extra.companyPercentageSnapshot),
        commissionThreshold:
          extra.commissionThresholdSnapshot == null
            ? null
            : Number(extra.commissionThresholdSnapshot),
        companyCommission: Number(extra.companyCommissionSnapshot),
        employeeNet: Number(extra.employeeNetSnapshot),
        snapshotStatus: extra.financialSnapshotStatus,
      }));
    const financials = calculateServiceFinancials({
      serviceBaseAmount: Number(service.serviceBaseAmountSnapshot),
      employeeServicePercentage: Number(service.employeePercentageSnapshot),
      extensions: (service.extensionesServicios ?? []).map((item) => ({
        amount: Number(item.montoAgregado),
        employeeExpected: Number(item.employeeExpectedSnapshot),
      })),
      cardExtras,
      customerTransportCharge: Number(
        service.customerTransportCharge ?? service.totalTransporte ?? 0,
      ),
      eligibleForEarnings:
        service.estado === 'finalizado' && !service.administrativeVoidAt,
    });
    const date = this.serviceDate(service);
    return {
      id: service.id,
      folio: this.folio(service.id),
      date: date.toISOString(),
      durationHours: Number(
        service.duracionFinalHoras ?? service.duracionPactadaHoras,
      ),
      employeeId: service.empleadaId,
      employeeName: service.empleada.nombreArtistico,
      bossId: service.empleada.jefeId,
      bossName: service.empleada.jefe
        ? [service.empleada.jefe.nombre, service.empleada.jefe.apellido]
            .filter(Boolean)
            .join(' ') || service.empleada.jefe.email
        : null,
      paymentMethod: service.metodoPago,
      place:
        service.locationNameSnapshot ??
        service.locationAddressSnapshot ??
        'Sin lugar',
      startAt: service.horaInicioServicio?.toISOString() ?? null,
      status: service.administrativeReviewRequired
        ? 'revision_administrativa'
        : service.administrativeVoidAt
          ? 'anulado'
          : service.estado,
      rating: service.calificacion,
      observations: service.notasJefe ?? service.notas,
      snapshotStatus: service.financialSnapshotStatus,
      hasLegacyExtraSnapshots: cardExtras.some(
        (extra) => extra.snapshotStatus === 'legacy_unverified',
      ),
      financials,
    };
  }

  private buildSummary(rows: WeeklyHistoryRow[]) {
    const sum = (select: (row: WeeklyHistoryRow) => number) =>
      Math.round(rows.reduce((total, row) => total + select(row), 0) * 100) /
      100;
    const completed = rows.filter((row) => row.status === 'finalizado');
    const ratings = rows.flatMap((row) =>
      row.rating == null ? [] : [row.rating],
    );
    const byMethod = (method: string) =>
      sum((row) =>
        row.paymentMethod === method
          ? row.financials.serviceCommissionableBase
          : 0,
      );
    return {
      services: completed.length,
      hours: sum((row) =>
        row.status === 'finalizado' ? row.durationHours : 0,
      ),
      serviceBase: sum((row) =>
        row.status === 'finalizado' ? row.financials.serviceBaseAmount : 0,
      ),
      extensions: sum((row) =>
        row.status === 'finalizado' ? row.financials.extensionsAmount : 0,
      ),
      commissionableBase: sum((row) =>
        row.status === 'finalizado'
          ? row.financials.serviceCommissionableBase
          : 0,
      ),
      employeeServiceExpected: sum(
        (row) => row.financials.employeeServiceExpected,
      ),
      cardExtras: sum((row) =>
        row.status === 'finalizado' ? row.financials.cardExtrasTotal : 0,
      ),
      cardExtraCompanyCommission: sum(
        (row) => row.financials.cardExtraCompanyCommission,
      ),
      cardExtrasEmployeeNet: sum((row) => row.financials.cardExtrasEmployeeNet),
      customerTransport: sum((row) =>
        row.status === 'finalizado'
          ? row.financials.customerTransportCharge
          : 0,
      ),
      employeeExpectedTotal: sum((row) => row.financials.employeeExpectedTotal),
      cashService: byMethod('efectivo'),
      cardService: byMethod('tarjeta'),
      transferService: byMethod('transferencia'),
      mixedService: byMethod('mixto'),
      cancelled: rows.filter((row) =>
        ['cancelado', 'anulado'].includes(row.status),
      ).length,
      averageRating:
        ratings.length > 0
          ? Math.round(
              (ratings.reduce((sum, rating) => sum + rating, 0) /
                ratings.length) *
                100,
            ) / 100
          : null,
    };
  }

  private serviceDate(service: Servicios): Date {
    return (
      service.horaFinServicio ??
      service.canceladoAt ??
      service.fechaProgramada ??
      service.createdAt
    );
  }

  private folio(id: string): string {
    return id.replace(/-/g, '').slice(0, 8).toUpperCase();
  }
}
