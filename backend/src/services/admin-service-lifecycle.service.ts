import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Not, Repository } from 'typeorm';
import { Empleadas } from '../employees/entities/employee.entity';
import { LiquidationRecord } from '../liquidations/entities/liquidation-record.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeEventsService } from '../realtime/realtime.service';
import { EmployeeCashObligation } from '../transport-operations/entities/employee-cash-obligation.entity';
import { Viajes } from '../trips/entities/trip.entity';
import { Usuarios } from '../users/entities/user.entity';
import { ServiceAdminAudit } from './entities/service-admin-audit.entity';
import { Servicios } from './entities/service.entity';
import { ServicesService } from './services.service';

type ServiceStateSnapshot = {
  status: string;
  operationalState: string | null;
};

@Injectable()
export class AdminServiceLifecycleService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Servicios)
    private readonly services: Repository<Servicios>,
    @InjectRepository(ServiceAdminAudit)
    private readonly audit: Repository<ServiceAdminAudit>,
    private readonly operationalServices: ServicesService,
    private readonly realtime: RealtimeEventsService,
    private readonly notifications: NotificationsService,
  ) {}

  async administrativelyCancel(id: string, actor: Usuarios, reason: string) {
    this.assertAdmin(actor);
    const initial = await this.getWithDependencies(id);
    if (initial.deletedAt)
      throw new ConflictException('El servicio esta en la papelera');
    if (initial.administrativeVoidAt) return { changed: false, serviceId: id };
    const previous = this.stateOf(initial);

    // El camino probado de cancelacion conserva avisos, cierre de conversacion,
    // costo de Uber y sincronizacion. Los grupales se resuelven debajo porque
    // su orquestador no acepta la puerta individual.
    if (initial.estado !== 'finalizado' && initial.serviceType !== 'grupal') {
      await this.operationalServices.cancel(id, actor, {
        reason: 'otro',
        note: reason.slice(0, 500),
      });
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const serviceRepository = manager.getRepository(Servicios);
      const service = await serviceRepository
        .createQueryBuilder('service')
        .setLock('pessimistic_write')
        .where('service.id = :id', { id })
        .getOne();
      if (!service) throw new NotFoundException('Servicio no encontrado');
      if (service.administrativeVoidAt)
        return { changed: false, serviceId: id };

      const dependencies = await this.countDependencies(manager, id);
      const tripRepository = manager.getRepository(Viajes);
      const activeTrips = await tripRepository.find({
        where: {
          servicioId: id,
          estado: Not(In(['finalizado', 'cancelado', 'rechazado'])),
        },
      });
      await tripRepository.update(
        {
          servicioId: id,
          estado: Not(In(['finalizado', 'cancelado', 'rechazado'])),
        },
        { estado: 'cancelado', ofertaExpiraEn: null },
      );

      service.estado = 'cancelado';
      service.operationalState = 'cancelado';
      service.canceladoAt ??= new Date();
      service.canceladoPorUserId ??= actor.id;
      service.administrativeVoidAt = new Date();
      service.administrativeVoidByUserId = actor.id;
      service.administrativeVoidReason = reason.trim();
      service.employeeAcceptanceExpiresAt = null;
      service.esperaExpiraAt = null;
      service.proximoRecordatorioRegresoAt = null;
      await serviceRepository.save(service);

      await manager
        .getRepository(LiquidationRecord)
        .update(
          { serviceId: id },
          { excludedFromCut: true, historicalServiceId: id },
        );
      await manager
        .getRepository(EmployeeCashObligation)
        .update(
          { serviceId: id },
          { administrativelyExcluded: true, historicalServiceId: id },
        );
      await manager.query(
        `UPDATE push_notification_events
            SET status = 'skipped'
          WHERE related_entity_id = $1 AND status = 'pending'`,
        [id],
      );
      await manager.query(
        `UPDATE customer_booking_sessions
            SET status = 'CANCELLED', current_requirement = NULL,
                updated_at = now(), version = version + 1
          WHERE service_id = $1 AND status <> 'CANCELLED'`,
        [id],
      );

      const participantRows = (await manager.query(
        `SELECT DISTINCT "employee_id" AS "employeeId"
           FROM service_participants
          WHERE "service_id" = $1`,
        [id],
      )) as Array<{ employeeId: string }>;
      await manager.query(
        `UPDATE service_participants
            SET status = 'cancelada', removed_at = COALESCE(removed_at, now()),
                updated_at = now()
          WHERE service_id = $1 AND status <> 'cancelada'`,
        [id],
      );
      await manager.query(
        `UPDATE group_service_requests
            SET status = 'cancelada', updated_at = now()
          WHERE service_id = $1 AND status <> 'cancelada'`,
        [id],
      );

      await this.releaseResources(
        manager,
        [
          service.empleadaId,
          ...participantRows.map((participant) => participant.employeeId),
        ],
        activeTrips,
      );
      await this.saveAudit(manager, service, actor, {
        action: previous.status === 'finalizado' ? 'voided' : 'cancelled',
        reason,
        previous,
        dependencies,
        result: { status: 'cancelado', resourcesReleased: true },
      });
      return { changed: true, serviceId: id };
    });

    await this.afterLifecycleChange(initial, 'service_admin_cancelled');
    return result;
  }

  async softDelete(id: string, actor: Usuarios, reason: string) {
    this.assertAdmin(actor);
    const initial = await this.getWithDependencies(id);
    if (initial.deletedAt) return { changed: false, serviceId: id };
    const previous = this.stateOf(initial);
    await this.administrativelyCancel(id, actor, reason);

    const result = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Servicios);
      const service = await repository
        .createQueryBuilder('service')
        .setLock('pessimistic_write')
        .where('service.id = :id', { id })
        .getOne();
      if (!service) throw new NotFoundException('Servicio no encontrado');
      if (service.deletedAt) return { changed: false, serviceId: id };
      const dependencies = await this.countDependencies(manager, id);
      service.deletedAt = new Date();
      service.deletedByUserId = actor.id;
      service.deleteReason = reason.trim();
      service.previousStatus = previous.status;
      service.previousOperationalState = previous.operationalState;
      await repository.save(service);
      await this.saveAudit(manager, service, actor, {
        action: 'soft_deleted',
        reason,
        previous,
        dependencies,
        result: { deletedAt: service.deletedAt.toISOString() },
      });
      return { changed: true, serviceId: id };
    });
    this.realtime.emitToJefes({ type: 'service_soft_deleted', serviceId: id });
    return result;
  }

  async restore(id: string, actor: Usuarios, reason: string) {
    this.assertAdmin(actor);
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Servicios);
      const service = await repository
        .createQueryBuilder('service')
        .setLock('pessimistic_write')
        .where('service.id = :id', { id })
        .getOne();
      if (!service) throw new NotFoundException('Servicio no encontrado');
      if (!service.deletedAt) return { changed: false, serviceId: id };
      const previous = this.stateOf(service);
      const dependencies = await this.countDependencies(manager, id);
      service.deletedAt = null;
      service.deletedByUserId = null;
      service.deleteReason = null;
      service.estado = 'cancelado';
      service.operationalState = 'cancelado';
      service.administrativeReviewRequired = true;
      await repository.save(service);
      await this.saveAudit(manager, service, actor, {
        action: 'restored',
        reason,
        previous,
        dependencies,
        result: {
          status: 'cancelado',
          operationalState: 'cancelado',
          administrativeReviewRequired: true,
          resourcesReactivated: false,
        },
      });
      this.realtime.emitToJefes({
        type: 'service_restored_for_review',
        serviceId: id,
      });
      return { changed: true, serviceId: id, reviewRequired: true };
    });
  }

  async hardDelete(
    id: string,
    actor: Usuarios,
    reason: string,
    confirmation: string,
  ) {
    this.assertAdmin(actor);
    if (confirmation !== 'ELIMINAR') {
      throw new ConflictException('Escribe ELIMINAR para confirmar');
    }
    const initial = await this.getWithDependencies(id);
    if (!initial.deletedAt) {
      throw new ConflictException('El servicio debe estar en la papelera');
    }
    const previous = this.stateOf(initial);

    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(Servicios);
      const service = await repository
        .createQueryBuilder('service')
        .setLock('pessimistic_write')
        .where('service.id = :id', { id })
        .getOne();
      if (!service) throw new NotFoundException('Servicio no encontrado');
      if (!service.deletedAt)
        throw new ConflictException('El servicio ya no esta en la papelera');
      const dependencies = await this.countDependencies(manager, id);
      const tripRows = (await manager.query(
        `SELECT id FROM viajes WHERE servicio_id = $1`,
        [id],
      )) as Array<{ id: string }>;
      const tripIds = tripRows.map((trip) => trip.id);

      await manager.query(
        `UPDATE conversaciones_telegram
            SET historical_service_id = COALESCE(historical_service_id, servicio_id),
                servicio_id = NULL
          WHERE servicio_id = $1`,
        [id],
      );
      await manager.query(
        `UPDATE liquidation_records
            SET historical_service_id = COALESCE(historical_service_id, service_id),
                service_id = NULL, excluded_from_cut = true
          WHERE service_id = $1`,
        [id],
      );
      await manager.query(
        `UPDATE employee_cash_obligations
            SET historical_service_id = COALESCE(historical_service_id, service_id),
                service_id = NULL, administratively_excluded = true
          WHERE service_id = $1`,
        [id],
      );
      await manager.query(
        `UPDATE employee_reports
            SET historical_service_id = COALESCE(historical_service_id, service_id),
                service_id = NULL
          WHERE service_id = $1`,
        [id],
      );
      await manager.query(
        `UPDATE interaction_ratings
            SET historical_service_id = COALESCE(historical_service_id, service_id),
                historical_trip_id = COALESCE(historical_trip_id, trip_id),
                service_id = NULL, trip_id = NULL
          WHERE service_id = $1 OR trip_id = ANY($2::uuid[])`,
        [id, tripIds],
      );
      await manager.query(
        `UPDATE conduct_reports
            SET historical_service_id = COALESCE(historical_service_id, service_id),
                historical_trip_id = COALESCE(historical_trip_id, trip_id),
                service_id = NULL, trip_id = NULL
          WHERE service_id = $1 OR trip_id = ANY($2::uuid[])`,
        [id, tripIds],
      );
      await manager.query(
        `UPDATE customer_booking_sessions
            SET metadata = metadata || jsonb_build_object('historicalServiceId', service_id),
                service_id = NULL, updated_at = now(), version = version + 1
          WHERE service_id = $1`,
        [id],
      );

      await this.saveAudit(manager, service, actor, {
        action: 'hard_deleted',
        reason,
        previous,
        dependencies,
        result: {
          deleted: true,
          conversationsPreserved: dependencies.conversations,
          ratingsPreserved: dependencies.ratings,
        },
      });
      await repository.delete(id);
      return { deleted: true, serviceId: id };
    });
  }

  private async getWithDependencies(id: string): Promise<Servicios> {
    const service = await this.services.findOne({
      where: { id },
      relations: {
        empleada: { usuario: true },
        viajes: true,
        extrasServicios: true,
        extensionesServicios: true,
      },
    });
    if (!service) throw new NotFoundException('Servicio no encontrado');
    return service;
  }

  private async releaseResources(
    manager: EntityManager,
    employeeIds: string[],
    trips: Viajes[],
  ): Promise<void> {
    const driverIds = [
      ...new Set(
        trips
          .map((trip) => trip.choferId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    for (const driverId of driverIds) {
      const open = await manager.getRepository(Viajes).exists({
        where: {
          choferId: driverId,
          estado: Not(In(['finalizado', 'cancelado', 'rechazado'])),
        },
      });
      if (!open) {
        await manager.query(
          `UPDATE choferes SET disponible = true WHERE id = $1`,
          [driverId],
        );
      }
      this.realtime.emitToDriver(driverId, {
        type: 'trip_cancelled',
        data: {},
      });
    }
    const uniqueEmployeeIds = [
      ...new Set(employeeIds.filter((id): id is string => Boolean(id))),
    ];
    for (const employeeId of uniqueEmployeeIds) {
      const [row] = (await manager.query(
        `SELECT (
            EXISTS (
              SELECT 1 FROM servicios service
               WHERE service.empleada_id = $1
                 AND service.estado IN ('pendiente', 'agendado', 'en_curso')
                 AND service.deleted_at IS NULL
            ) OR EXISTS (
              SELECT 1 FROM service_participants participant
              JOIN servicios service ON service.id = participant.service_id
               WHERE participant.employee_id = $1
                 AND participant.status IN ('reservada', 'pendiente_pago', 'activa')
                 AND service.estado IN ('pendiente', 'agendado', 'en_curso')
                 AND service.deleted_at IS NULL
            )
          ) AS active`,
        [employeeId],
      )) as Array<{ active: boolean }>;
      if (!row?.active) {
        await manager
          .getRepository(Empleadas)
          .update(employeeId, { disponible: true });
      }
    }
  }

  private async afterLifecycleChange(service: Servicios, eventType: string) {
    const event = { type: eventType, data: { serviceId: service.id } };
    this.realtime.emitToBoss(service.jefeId, event);
    this.realtime.emitToEmployee(service.empleadaId, event);
    const userId = service.empleada?.usuarioId;
    if (userId) {
      await this.notifications.notificar(userId, {
        titulo: 'Actualizacion administrativa',
        cuerpo: 'Un servicio requiere tu atencion en la aplicacion.',
        url: '/empleada/historial',
        tag: `admin-service-${service.id}`,
        relatedEntityId: service.id,
        dedupeKey: `${eventType}:${service.id}`,
      });
    }
  }

  private async countDependencies(manager: EntityManager, serviceId: string) {
    const rows = (await manager.query(
      `SELECT
        (SELECT COUNT(*)::int FROM viajes WHERE servicio_id = $1) AS trips,
        (SELECT COUNT(*)::int FROM extras_servicio WHERE servicio_id = $1) AS extras,
        (SELECT COUNT(*)::int FROM extensiones_servicio WHERE servicio_id = $1) AS extensions,
        (SELECT COUNT(*)::int FROM conversaciones_telegram WHERE servicio_id = $1) AS conversations,
        (SELECT COUNT(*)::int FROM interaction_ratings WHERE service_id = $1) AS ratings,
        (SELECT COUNT(*)::int FROM liquidation_records WHERE service_id = $1) AS liquidations,
        (SELECT COUNT(*)::int FROM employee_cash_obligations WHERE service_id = $1) AS cash_obligations`,
      [serviceId],
    )) as Array<Record<string, number>>;
    return rows[0] ?? {};
  }

  private async saveAudit(
    manager: EntityManager,
    service: Servicios,
    actor: Usuarios,
    input: {
      action: ServiceAdminAudit['action'];
      reason: string;
      previous: ServiceStateSnapshot;
      dependencies: Record<string, unknown>;
      result: Record<string, unknown>;
    },
  ) {
    await manager.getRepository(ServiceAdminAudit).save(
      manager.getRepository(ServiceAdminAudit).create({
        serviceId: service.id,
        action: input.action,
        actorId: actor.id,
        actorRole: actor.rol,
        reason: input.reason.trim(),
        previousState: input.previous.status,
        previousOperationalState: input.previous.operationalState,
        financialSnapshot: {
          serviceBaseAmount: Number(service.serviceBaseAmountSnapshot),
          employeePercentage: Number(service.employeePercentageSnapshot),
          totalBase: Number(service.totalBase),
          totalExtras: Number(service.totalExtras),
          totalTransport: Number(
            service.customerTransportCharge ?? service.totalTransporte,
          ),
          totalFinal: Number(service.totalFinal),
        },
        affectedDependencies: input.dependencies,
        result: input.result,
      }),
    );
  }

  private stateOf(service: Servicios): ServiceStateSnapshot {
    return {
      status: service.estado,
      operationalState: service.operationalState ?? null,
    };
  }

  private assertAdmin(actor: Usuarios): void {
    if (actor.rol !== 'admin')
      throw new ForbiddenException(
        'Solo administracion puede realizar esta accion',
      );
  }
}
