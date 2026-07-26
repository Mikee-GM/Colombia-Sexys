import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Clientes } from '../clients/entities/client.entity';
import { Servicios } from '../services/entities/service.entity';
import { Viajes } from '../trips/entities/trip.entity';
import { Usuarios } from '../users/entities/user.entity';
import {
  AssignReportDto,
  ChangeReportPriorityDto,
  CloseReportDto,
  ReportNoteDto,
} from './dto/report-actions.dto';
import { ReportQueryDto } from './dto/report-query.dto';
import { EmployeeReportHistory } from './entities/employee-report-history.entity';
import {
  EmployeeReport,
  ReportCategory,
  ReportPriority,
  ReportStatus,
} from './entities/employee-report.entity';

const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;
const REPORT_TOLERANCE = 3;
const EXTENSION_TOLERANCE = 5;

@Injectable()
export class EmployeeReportsService {
  constructor(
    @InjectRepository(EmployeeReport)
    private readonly reports: Repository<EmployeeReport>,
    @InjectRepository(EmployeeReportHistory)
    private readonly history: Repository<EmployeeReportHistory>,
    private readonly dataSource: DataSource,
  ) {}

  private priorityFor(category: ReportCategory): ReportPriority {
    if (category === 'seguridad') return 'urgente';
    if (category === 'cobro' || category === 'incumplimiento') return 'alta';
    return 'normal';
  }

  private assertWithinWindow(date: Date | null, label: string) {
    if (!date) throw new ConflictException(`${label} aún no ha finalizado`);
    const elapsed = Date.now() - new Date(date).getTime();
    if (elapsed < 0 || elapsed > REPORT_WINDOW_MS) {
      throw new ConflictException('El plazo de 24 horas para reportar venció');
    }
  }

  async createFromClient(
    telegramChatId: string,
    serviceId: string,
    category: ReportCategory,
    description: string,
  ) {
    const client = await this.dataSource.getRepository(Clientes).findOne({
      where: { telegramChatId },
    });
    if (!client) throw new ForbiddenException('Cliente no vinculado');

    const service = await this.dataSource.getRepository(Servicios).findOne({
      where: { id: serviceId },
    });
    if (!service || service.clienteId !== client.id) {
      throw new ForbiddenException('El servicio no pertenece al cliente');
    }
    if (service.estado !== 'finalizado') {
      throw new ConflictException('Sólo se reportan servicios finalizados');
    }
    this.assertWithinWindow(service.horaFinServicio, 'El servicio');

    return this.createVerified({
      service,
      category,
      description,
      origin: 'cliente',
      clientId: client.id,
      driverId: null,
      reporterKey: `cliente:${client.id}`,
    });
  }

  async createFromDriver(
    telegramChatId: string,
    serviceId: string,
    category: ReportCategory,
    description: string,
  ) {
    const user = await this.dataSource.getRepository(Usuarios).findOne({
      where: { telegramChatId, rol: 'chofer' },
      relations: { choferes: true },
    });
    const driver = user?.choferes;
    if (!driver) throw new ForbiddenException('Chofer no vinculado');

    const trip = await this.dataSource.getRepository(Viajes).findOne({
      where: {
        servicioId: serviceId,
        choferId: driver.id,
        estado: 'finalizado',
      },
      relations: { servicio: true },
      order: { horaFinViaje: 'DESC' },
    });
    if (!trip) {
      throw new ForbiddenException(
        'No existe un viaje finalizado de este chofer',
      );
    }
    this.assertWithinWindow(trip.horaFinViaje, 'El viaje');

    return this.createVerified({
      service: trip.servicio,
      category,
      description,
      origin: 'chofer',
      clientId: null,
      driverId: driver.id,
      reporterKey: `chofer:${driver.id}`,
    });
  }

  private async createVerified(input: {
    service: Servicios;
    category: ReportCategory;
    description: string;
    origin: 'cliente' | 'chofer';
    clientId: string | null;
    driverId: string | null;
    reporterKey: string;
  }) {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      const report = queryRunner.manager.create(EmployeeReport, {
        serviceId: input.service.id,
        employeeId: input.service.empleadaId,
        bossId: input.service.jefeId,
        category: input.category,
        description: input.description.trim(),
        origin: input.origin,
        clientId: input.clientId,
        driverId: input.driverId,
        reporterKey: input.reporterKey,
        priority: this.priorityFor(input.category),
        status: 'nuevo',
      });
      const saved = await queryRunner.manager.save(report);
      await queryRunner.manager.save(EmployeeReportHistory, {
        reportId: saved.id,
        actorUserId: null,
        action: 'creado',
        metadata: { origin: input.origin, category: input.category },
        note: null,
      });
      await queryRunner.commitTransaction();
      return saved;
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      if (error?.code === '23505') {
        throw new ConflictException('Ya existe un reporte de esta categoría');
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(query: ReportQueryDto, actor: Usuarios) {
    const qb = this.reports
      .createQueryBuilder('report')
      .leftJoinAndSelect('report.employee', 'employee')
      .leftJoinAndSelect('report.client', 'client')
      .leftJoinAndSelect('report.driver', 'driver')
      .leftJoinAndSelect('report.assignedAdmin', 'assignedAdmin')
      .orderBy('report.createdAt', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (actor.rol === 'jefe')
      qb.andWhere('report.bossId = :actorId', { actorId: actor.id });
    if (query.status)
      qb.andWhere('report.status = :status', { status: query.status });
    if (query.priority)
      qb.andWhere('report.priority = :priority', { priority: query.priority });
    if (query.category)
      qb.andWhere('report.category = :category', { category: query.category });
    if (query.origin)
      qb.andWhere('report.origin = :origin', { origin: query.origin });
    if (query.employeeId)
      qb.andWhere('report.employeeId = :employeeId', {
        employeeId: query.employeeId,
      });
    if (query.bossId && actor.rol === 'admin')
      qb.andWhere('report.bossId = :bossId', { bossId: query.bossId });
    if (query.from)
      qb.andWhere('report.createdAt >= :from', { from: query.from });
    if (query.to) qb.andWhere('report.createdAt <= :to', { to: query.to });

    const [items, total] = await qb.getManyAndCount();
    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      pages: Math.ceil(total / query.limit),
    };
  }

  async findOne(id: string, actor: Usuarios) {
    const report = await this.reports.findOne({
      where: { id },
      relations: {
        employee: true,
        client: true,
        driver: true,
        assignedAdmin: true,
        service: { prorrogases: true },
        history: { actor: true },
      },
      order: { history: { createdAt: 'ASC' } },
    });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    this.assertCanRead(report, actor);
    return report;
  }

  async findHistory(id: string, actor: Usuarios) {
    const report = await this.reports.findOne({ where: { id } });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    this.assertCanRead(report, actor);
    return this.history.find({
      where: { reportId: id },
      relations: { actor: true },
      order: { createdAt: 'ASC' },
    });
  }

  private assertCanRead(report: EmployeeReport, actor: Usuarios) {
    if (
      actor.rol !== 'admin' &&
      (actor.rol !== 'jefe' || report.bossId !== actor.id)
    ) {
      throw new ForbiddenException('No puedes consultar este reporte');
    }
  }

  private assertAdmin(actor: Usuarios) {
    if (actor.rol !== 'admin')
      throw new ForbiddenException('Sólo un admin puede gestionar reportes');
  }

  private async mutate(
    id: string,
    actor: Usuarios,
    action: string,
    update: Partial<EmployeeReport>,
    note: string | null = null,
    metadata: Record<string, unknown> | null = null,
  ) {
    this.assertAdmin(actor);
    return this.dataSource.transaction(async (manager) => {
      const report = await manager.findOne(EmployeeReport, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!report) throw new NotFoundException('Reporte no encontrado');
      if (report.status === 'resuelto' || report.status === 'descartado') {
        throw new ConflictException(
          'Un reporte cerrado ya no puede modificarse',
        );
      }
      if (update.status === 'en_revision' && report.status !== 'nuevo') {
        throw new ConflictException(
          'Sólo un reporte nuevo puede iniciar revisión',
        );
      }
      Object.assign(report, update, { updatedAt: new Date() });
      const saved = await manager.save(report);
      await manager.save(EmployeeReportHistory, {
        reportId: id,
        actorUserId: actor.id,
        action,
        metadata,
        note,
      });
      return saved;
    });
  }

  async assign(id: string, dto: AssignReportDto, actor: Usuarios) {
    this.assertAdmin(actor);
    const admin = await this.dataSource
      .getRepository(Usuarios)
      .findOne({ where: { id: dto.adminId, rol: 'admin', activo: true } });
    if (!admin)
      throw new BadRequestException('El responsable debe ser un admin activo');
    return this.mutate(
      id,
      actor,
      'asignado',
      { assignedAdminId: admin.id },
      null,
      { adminId: admin.id },
    );
  }

  take(id: string, actor: Usuarios) {
    this.assertAdmin(actor);
    return this.mutate(
      id,
      actor,
      'asignado',
      { assignedAdminId: actor.id },
      null,
      { adminId: actor.id },
    );
  }

  changePriority(id: string, dto: ChangeReportPriorityDto, actor: Usuarios) {
    return this.mutate(
      id,
      actor,
      'prioridad_cambiada',
      { priority: dto.priority },
      null,
      { priority: dto.priority },
    );
  }

  startReview(id: string, actor: Usuarios) {
    return this.mutate(
      id,
      actor,
      'estado_cambiado',
      { status: 'en_revision', assignedAdminId: actor.id },
      null,
      { status: 'en_revision' },
    );
  }

  addNote(id: string, dto: ReportNoteDto, actor: Usuarios) {
    return this.mutate(id, actor, 'nota_agregada', {}, dto.note);
  }

  close(
    id: string,
    status: Extract<ReportStatus, 'resuelto' | 'descartado'>,
    dto: CloseReportDto,
    actor: Usuarios,
  ) {
    return this.mutate(
      id,
      actor,
      'estado_cambiado',
      {
        status,
        resolution: dto.resolution,
        resolvedAt: new Date(),
        assignedAdminId: actor.id,
      },
      dto.resolution,
      { status },
    );
  }

  async tolerance(actor: Usuarios) {
    const params: unknown[] = [];
    let reportScope = '';
    let serviceScope = '';
    let employeeScope = '';
    let historicalScope = '';
    if (actor.rol === 'jefe') {
      params.push(actor.id);
      reportScope = 'AND r.boss_id = $1';
      serviceScope = 'AND s.jefe_id = $1';
      employeeScope = `WHERE EXISTS (SELECT 1 FROM servicios scoped WHERE scoped.empleada_id = e.id AND scoped.jefe_id = $1)`;
      historicalScope = 'AND s2.jefe_id = $1';
    }
    const rows = await this.dataSource.query(
      `SELECT e.id AS "employeeId", e.nombre_artistico AS "employeeName",
        COUNT(DISTINCT r.id) FILTER (WHERE r.status <> 'descartado' AND r.created_at >= now() - interval '90 days')::int AS "reports90Days",
        COUNT(DISTINCT r.id)::int AS "reportsHistorical",
        COUNT(DISTINCT p.id) FILTER (WHERE p.solicitada_at >= now() - interval '30 days')::int AS "extensions30Days",
        COALESCE((SELECT SUM(s2.prorrogas_usadas)::int FROM servicios s2 WHERE s2.empleada_id = e.id ${historicalScope}), 0) AS "extensionsHistorical"
       FROM empleadas e
       LEFT JOIN employee_reports r ON r.employee_id = e.id ${reportScope}
       LEFT JOIN servicios s ON s.empleada_id = e.id ${serviceScope}
       LEFT JOIN prorrogas p ON p.servicio_id = s.id
       ${employeeScope}
       GROUP BY e.id, e.nombre_artistico
       ORDER BY e.nombre_artistico`,
      params,
    );
    return rows.map((row: any) => ({
      ...row,
      reportsOverTolerance: Number(row.reports90Days) >= REPORT_TOLERANCE,
      extensionsOverTolerance:
        Number(row.extensions30Days) >= EXTENSION_TOLERANCE,
      reportTolerance: REPORT_TOLERANCE,
      extensionTolerance: EXTENSION_TOLERANCE,
    }));
  }

  async dashboardSummary(actor: Usuarios) {
    const qb = this.reports.createQueryBuilder('report');
    if (actor.rol === 'jefe') qb.where('report.bossId = :id', { id: actor.id });
    const rows = await qb
      .select(`COUNT(*) FILTER (WHERE report.status = 'nuevo')`, 'newCases')
      .addSelect(
        `COUNT(*) FILTER (WHERE report.priority = 'urgente' AND report.status NOT IN ('resuelto','descartado'))`,
        'urgentCases',
      )
      .getRawOne();
    const tolerance = await this.tolerance(actor);
    return {
      newCases: Number(rows?.newCases || 0),
      urgentCases: Number(rows?.urgentCases || 0),
      employeesOverTolerance: tolerance.filter(
        (item: any) =>
          item.reportsOverTolerance || item.extensionsOverTolerance,
      ).length,
    };
  }
}
