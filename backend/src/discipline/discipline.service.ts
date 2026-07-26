import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { RealtimeEventsService } from '../realtime/realtime.service';
import {
  CloseConductReportDto,
  CreateConductReportDto,
  CreateRatingDto,
  CreateSanctionDto,
  RevokeSanctionDto,
} from './dto/discipline.dto';
import { ConductReport } from './entities/conduct-report.entity';
import { DisciplinarySanction } from './entities/disciplinary-sanction.entity';
import {
  InteractionRating,
  RatingDirection,
} from './entities/interaction-rating.entity';

type PersonType = 'client' | 'employee' | 'driver';
type Actor = { id: string; rol: 'jefe' | 'empleada' | 'chofer' | 'admin' };
type ResolvedInteraction = {
  serviceId: string | null;
  tripId: string | null;
  clientId: string;
  employeeId: string;
  driverId: string | null;
  reporterType: PersonType;
  reporterId: string;
  subjectType: PersonType;
  subjectId: string;
  bossId: string;
  finishedAt: Date;
};

@Injectable()
export class DisciplineService implements OnModuleInit, OnModuleDestroy {
  private static readonly WINDOW_MS = 24 * 60 * 60 * 1000;
  private expirationTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(InteractionRating)
    private readonly ratings: Repository<InteractionRating>,
    @InjectRepository(ConductReport)
    private readonly reports: Repository<ConductReport>,
    @InjectRepository(DisciplinarySanction)
    private readonly sanctions: Repository<DisciplinarySanction>,
    private readonly dataSource: DataSource,
    private readonly realtime: RealtimeEventsService,
  ) {}

  onModuleInit() {
    this.expirationTimer = setInterval(
      () => void this.expireSanctions().catch(() => undefined),
      60_000,
    );
    this.expirationTimer.unref();
  }

  onModuleDestroy() {
    if (this.expirationTimer) clearInterval(this.expirationTimer);
  }

  async createRating(actor: Actor, dto: CreateRatingDto) {
    const interaction = await this.resolveInteraction(
      dto.direction,
      dto.interactionId,
      actor,
    );
    return this.persistRating(dto, interaction);
  }

  async createClientRating(
    clientId: string,
    dto: CreateRatingDto,
  ): Promise<InteractionRating> {
    if (dto.direction !== 'client_to_employee') {
      throw new ForbiddenException('Dirección de calificación no permitida');
    }
    const interaction = await this.resolveInteractionForPerson(
      dto.direction,
      dto.interactionId,
      'client',
      clientId,
      dto.employeeId,
    );
    return this.persistRating(dto, interaction);
  }

  private async persistRating(
    dto: CreateRatingDto,
    interaction: ResolvedInteraction,
  ) {
    if (dto.stars <= 2 && !dto.comment?.trim()) {
      throw new BadRequestException(
        'El comentario es obligatorio para una o dos estrellas',
      );
    }
    const rating = this.ratings.create({
      direction: dto.direction,
      serviceId: interaction.serviceId,
      tripId: interaction.tripId,
      clientId: interaction.clientId,
      employeeId: interaction.employeeId,
      driverId: interaction.driverId,
      stars: dto.stars,
      comment: dto.comment?.trim() || null,
    });
    try {
      const saved = await this.ratings.save(rating);
      await this.refreshPublicEmployeeRating(interaction.employeeId, dto.direction);
      await this.evaluateRatingThreshold(
        interaction.subjectType,
        interaction.subjectId,
        dto.direction,
      );
      this.emitDisciplineEvent(interaction, 'discipline.rating.created', {
        ratingId: saved.id,
        direction: saved.direction,
      });
      return saved;
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new ConflictException('Esta interacción ya fue calificada');
      }
      throw error;
    }
  }

  async createReport(actor: Actor, dto: CreateConductReportDto) {
    const interaction = await this.resolveInteraction(
      dto.direction,
      dto.interactionId,
      actor,
    );
    return this.persistReport(dto, interaction);
  }

  async createClientReport(clientId: string, dto: CreateConductReportDto) {
    if (dto.direction !== 'client_to_employee') {
      throw new ForbiddenException('Dirección de reporte no permitida');
    }
    const interaction = await this.resolveInteractionForPerson(
      dto.direction,
      dto.interactionId,
      'client',
      clientId,
    );
    return this.persistReport(dto, interaction);
  }

  private async persistReport(
    dto: CreateConductReportDto,
    interaction: ResolvedInteraction,
  ) {
    const report = this.reports.create({
      direction: dto.direction,
      reporterType: interaction.reporterType,
      reporterId: interaction.reporterId,
      subjectType: interaction.subjectType,
      subjectId: interaction.subjectId,
      serviceId: interaction.serviceId,
      tripId: interaction.tripId,
      category: dto.category,
      description: dto.description.trim(),
      priority: dto.category === 'seguridad' ? 'urgente' : 'normal',
      history: [
        {
          at: new Date().toISOString(),
          action: 'created',
          actorType: interaction.reporterType,
          actorId: interaction.reporterId,
        },
      ],
    });
    let saved: ConductReport;
    try {
      saved = await this.reports.save(report);
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new ConflictException(
          'Ya existe un reporte de esta categoría para la interacción',
        );
      }
      throw error;
    }
    this.emitDisciplineEvent(interaction, 'discipline.report.created', {
      reportId: saved.id,
      priority: saved.priority,
    });
    return saved;
  }

  async listReports(actor: Actor, filters: Record<string, string | undefined>) {
    const query = this.reports.createQueryBuilder('report');
    for (const field of [
      'direction',
      'subjectType',
      'priority',
      'status',
      'outcome',
      'category',
    ] as const) {
      if (filters[field]) {
        query.andWhere(`report.${field} = :${field}`, {
          [field]: filters[field],
        });
      }
    }
    if (actor.rol === 'jefe') {
      query.andWhere(
        `EXISTS (
          SELECT 1 FROM servicios s
          WHERE s.id = report.service_id AND s.jefe_id = :bossId
        )`,
        { bossId: actor.id },
      );
    } else if (actor.rol !== 'admin') {
      throw new ForbiddenException('No puede consultar reportes disciplinarios');
    }
    return query.orderBy('report.createdAt', 'DESC').getMany();
  }

  async closeReport(id: string, dto: CloseConductReportDto, admin: Actor) {
    this.assertAdmin(admin);
    const report = await this.reports.findOneBy({ id });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    report.status = 'cerrado';
    report.outcome = dto.outcome;
    report.resolution = dto.resolution.trim();
    report.assignedAdminId = admin.id;
    report.updatedAt = new Date();
    report.history = [
      ...(report.history ?? []),
      {
        at: report.updatedAt.toISOString(),
        action: 'closed',
        outcome: dto.outcome,
        actorType: 'admin',
        actorId: admin.id,
      },
    ];
    const saved = await this.reports.save(report);
    if (dto.outcome === 'confirmado') {
      await this.evaluateConfirmedReportThreshold(
        report.subjectType,
        report.subjectId,
      );
    }
    this.realtime.emitToJefes({
      type: 'discipline.report.closed',
      reportId: report.id,
      outcome: report.outcome,
    });
    return saved;
  }

  async createSanction(dto: CreateSanctionDto, admin: Actor) {
    this.assertAdmin(admin);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (dto.type === 'suspension' && (!endsAt || endsAt <= startsAt)) {
      throw new BadRequestException(
        'La suspensión requiere una fecha final posterior al inicio',
      );
    }
    await this.assertPersonExists(dto.subjectType, dto.subjectId);
    const sanction = await this.sanctions.save(
      this.sanctions.create({
        subjectType: dto.subjectType,
        subjectId: dto.subjectId,
        type: dto.type,
        reason: dto.reason.trim(),
        conductReportId: dto.conductReportId ?? null,
        createdByUserId: admin.id,
        startsAt,
        endsAt,
      }),
    );
    if (
      dto.type === 'permanent_ban' &&
      (dto.subjectType === 'employee' || dto.subjectType === 'driver')
    ) {
      await this.setOperationalUserActive(dto.subjectType, dto.subjectId, false);
    }
    this.realtime.emitToJefes({
      type: 'discipline.sanction.applied',
      sanctionId: sanction.id,
      subjectType: sanction.subjectType,
      subjectId: sanction.subjectId,
    });
    return sanction;
  }

  async revokeSanction(id: string, dto: RevokeSanctionDto, admin: Actor) {
    this.assertAdmin(admin);
    const sanction = await this.sanctions.findOneBy({ id });
    if (!sanction) throw new NotFoundException('Sanción no encontrada');
    if (sanction.status !== 'active') {
      throw new ConflictException('La sanción ya no está activa');
    }
    sanction.status = 'revoked';
    sanction.revokedAt = new Date();
    sanction.revokedByUserId = admin.id;
    sanction.revocationReason = dto.reason.trim();
    const saved = await this.sanctions.save(sanction);
    if (
      sanction.type === 'permanent_ban' &&
      (sanction.subjectType === 'employee' ||
        sanction.subjectType === 'driver')
    ) {
      const remaining = await this.getActiveSanction(
        sanction.subjectType,
        sanction.subjectId,
      );
      if (!remaining?.type || remaining.type !== 'permanent_ban') {
        await this.setOperationalUserActive(
          sanction.subjectType,
          sanction.subjectId,
          true,
        );
      }
    }
    this.realtime.emitToJefes({
      type: 'discipline.sanction.revoked',
      sanctionId: sanction.id,
    });
    return saved;
  }

  async listSanctions(actor: Actor, subjectType?: PersonType, subjectId?: string) {
    if (actor.rol !== 'admin' && actor.rol !== 'jefe') {
      throw new ForbiddenException('No puede consultar sanciones');
    }
    await this.expireSanctions();
    const query = this.sanctions.createQueryBuilder('sanction');
    if (subjectType) {
      query.andWhere('sanction.subjectType = :subjectType', { subjectType });
    }
    if (subjectId) {
      query.andWhere('sanction.subjectId = :subjectId', { subjectId });
    }
    if (actor.rol === 'jefe') {
      query.andWhere(
        `(
          (sanction.subject_type = 'employee' AND EXISTS (
            SELECT 1 FROM empleadas e WHERE e.id = sanction.subject_id AND e.jefe_id = :bossId
          ))
          OR (sanction.subject_type IN ('client','driver') AND EXISTS (
            SELECT 1 FROM conduct_reports r
            JOIN servicios s ON s.id = r.service_id
            WHERE r.subject_type = sanction.subject_type
              AND r.subject_id = sanction.subject_id
              AND s.jefe_id = :bossId
          ))
        )`,
        { bossId: actor.id },
      );
    }
    return query.orderBy('sanction.createdAt', 'DESC').getMany();
  }

  async getDossier(
    actor: Actor,
    subjectType: PersonType,
    subjectId: string,
  ) {
    if (actor.rol !== 'admin' && actor.rol !== 'jefe') {
      throw new ForbiddenException('No puede consultar expedientes');
    }
    if (actor.rol === 'jefe') {
      await this.assertBossScope(actor.id, subjectType, subjectId);
    }
    const [ratings, reports, sanctions] = await Promise.all([
      this.ratingSummary(subjectType, subjectId),
      this.reports.find({
        where: { subjectType, subjectId, outcome: 'confirmado' },
        order: { createdAt: 'DESC' },
      }),
      this.sanctions.find({
        where: { subjectType, subjectId },
        order: { createdAt: 'DESC' },
      }),
    ]);
    return { subjectType, subjectId, ratings, reports, sanctions };
  }

  async ownReputation(actor: Actor) {
    const identity = await this.identityForActor(actor);
    if (!identity || identity.type === 'client') {
      throw new ForbiddenException('No hay reputación interna para este usuario');
    }
    return {
      subjectType: identity.type,
      subjectId: identity.id,
      ratings: await this.ratingSummary(identity.type, identity.id),
      sanction: await this.getActiveSanction(identity.type, identity.id),
    };
  }

  async getActiveSanction(subjectType: PersonType, subjectId: string) {
    await this.expireSanctions();
    return this.sanctions.findOne({
      where: [
        {
          subjectType,
          subjectId,
          status: 'active',
          type: 'permanent_ban',
          startsAt: LessThanOrEqual(new Date()),
        },
        {
          subjectType,
          subjectId,
          status: 'active',
          type: 'suspension',
          startsAt: LessThanOrEqual(new Date()),
          endsAt: MoreThan(new Date()),
        },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async assertOperationallyAllowed(
    subjectType: PersonType,
    subjectId: string,
  ) {
    const sanction = await this.getActiveSanction(subjectType, subjectId);
    if (sanction) {
      throw new ForbiddenException({
        message:
          sanction.type === 'permanent_ban'
            ? 'La cuenta tiene un baneo permanente'
            : 'La cuenta se encuentra suspendida',
        sanction: {
          type: sanction.type,
          startsAt: sanction.startsAt,
          endsAt: sanction.endsAt,
          reason: sanction.reason,
        },
      });
    }
  }

  private async resolveInteraction(
    direction: RatingDirection,
    interactionId: string,
    actor: Actor,
  ) {
    const identity = await this.identityForActor(actor);
    if (!identity) throw new ForbiddenException('Participante no reconocido');
    return this.resolveInteractionForPerson(
      direction,
      interactionId,
      identity.type,
      identity.id,
    );
  }

  private async resolveInteractionForPerson(
    direction: RatingDirection,
    interactionId: string,
    actorType: PersonType,
    actorId: string,
    targetEmployeeId?: string,
  ): Promise<ResolvedInteraction> {
    const usesTrip =
      direction === 'driver_to_employee' ||
      direction === 'employee_to_driver';
    const rows: any[] = usesTrip
      ? await this.dataSource.query(
          `SELECT v.id AS trip_id, v.chofer_id AS driver_id,
                  v.estado AS trip_status, v.hora_fin_viaje AS finished_at,
                  s.id AS service_id, s.cliente_id AS client_id,
                  s.empleada_id AS employee_id, s.jefe_id AS boss_id
           FROM viajes v JOIN servicios s ON s.id = v.servicio_id
           WHERE v.id = $1`,
          [interactionId],
        )
      : await this.dataSource.query(
          `SELECT s.id AS service_id, NULL::uuid AS trip_id,
                  s.cliente_id AS client_id, s.empleada_id AS employee_id,
                  NULL::uuid AS driver_id, s.jefe_id AS boss_id,
                  s.estado AS service_status, s.hora_fin_servicio AS finished_at
           FROM servicios s WHERE s.id = $1`,
          [interactionId],
        );
    const row = rows[0];
    if (!row) throw new NotFoundException('Interacción no encontrada');
    if (targetEmployeeId) {
      if (direction !== 'client_to_employee' || usesTrip)
        throw new BadRequestException('La empleada objetivo no es válida');
      if (row.employee_id !== targetEmployeeId) {
        const participants: Array<{ employee_id: string }> =
          await this.dataSource.query(
            `SELECT employee_id
             FROM service_participants
             WHERE service_id = $1 AND employee_id = $2
               AND status <> 'cancelada'`,
            [row.service_id, targetEmployeeId],
          );
        if (!participants.length)
          throw new ForbiddenException(
            'La empleada no participó en este servicio',
          );
      }
      row.employee_id = targetEmployeeId;
    }
    const finished =
      usesTrip ? row.trip_status === 'finalizado' : row.service_status === 'finalizado';
    if (!finished || !row.finished_at) {
      throw new BadRequestException('La interacción todavía no ha finalizado');
    }
    const finishedAt = new Date(row.finished_at);
    if (
      Date.now() < finishedAt.getTime() ||
      Date.now() - finishedAt.getTime() > DisciplineService.WINDOW_MS
    ) {
      throw new BadRequestException(
        'La ventana de calificación y reporte de 24 horas terminó',
      );
    }
    const map: Record<
      RatingDirection,
      { reporterType: PersonType; subjectType: PersonType }
    > = {
      client_to_employee: {
        reporterType: 'client',
        subjectType: 'employee',
      },
      employee_to_client: {
        reporterType: 'employee',
        subjectType: 'client',
      },
      driver_to_employee: {
        reporterType: 'driver',
        subjectType: 'employee',
      },
      employee_to_driver: {
        reporterType: 'employee',
        subjectType: 'driver',
      },
    };
    const definition = map[direction];
    const ids: Record<PersonType, string | null> = {
      client: row.client_id,
      employee: row.employee_id,
      driver: row.driver_id,
    };
    if (
      actorType !== definition.reporterType ||
      ids[actorType] !== actorId
    ) {
      throw new ForbiddenException('No pertenece a esta interacción');
    }
    const subjectId = ids[definition.subjectType];
    if (!subjectId) throw new BadRequestException('La interacción no tiene sujeto');
    return {
      serviceId: row.service_id,
      tripId: row.trip_id,
      clientId: row.client_id,
      employeeId: row.employee_id,
      driverId: row.driver_id,
      reporterType: definition.reporterType,
      reporterId: actorId,
      subjectType: definition.subjectType,
      subjectId,
      bossId: row.boss_id,
      finishedAt,
    };
  }

  private async identityForActor(
    actor: Actor,
  ): Promise<{ type: PersonType; id: string } | null> {
    if (actor.rol === 'empleada') {
      const rows = await this.dataSource.query(
        'SELECT id FROM empleadas WHERE usuario_id = $1',
        [actor.id],
      );
      return rows[0] ? { type: 'employee', id: rows[0].id } : null;
    }
    if (actor.rol === 'chofer') {
      const rows = await this.dataSource.query(
        'SELECT id FROM choferes WHERE usuario_id = $1',
        [actor.id],
      );
      return rows[0] ? { type: 'driver', id: rows[0].id } : null;
    }
    return null;
  }

  private async ratingSummary(subjectType: PersonType, subjectId: string) {
    const column =
      subjectType === 'client'
        ? 'client_id'
        : subjectType === 'employee'
          ? 'employee_id'
          : 'driver_id';
    return this.dataSource.query(
      `SELECT direction,
              ROUND(AVG(stars)::numeric, 2)::float AS average,
              COUNT(*)::int AS count
       FROM interaction_ratings
       WHERE ${column} = $1
         AND direction LIKE $2
       GROUP BY direction ORDER BY direction`,
      [subjectId, `%_to_${subjectType}`],
    );
  }

  private async evaluateRatingThreshold(
    subjectType: PersonType,
    subjectId: string,
    direction: RatingDirection,
  ) {
    const column =
      subjectType === 'client'
        ? 'client_id'
        : subjectType === 'employee'
          ? 'employee_id'
          : 'driver_id';
    const [metric] = await this.dataSource.query(
      `SELECT AVG(stars)::float AS average, COUNT(*)::int AS count
       FROM interaction_ratings
       WHERE ${column} = $1 AND direction = $2`,
      [subjectId, direction],
    );
    if (metric.count >= 5 && metric.average < 2.5) {
      this.realtime.emitToJefes({
        type: 'discipline.risk.rating_threshold',
        subjectType,
        subjectId,
        direction,
        average: metric.average,
        count: metric.count,
      });
    }
  }

  private async evaluateConfirmedReportThreshold(
    subjectType: PersonType,
    subjectId: string,
  ) {
    const count = await this.reports.count({
      where: {
        subjectType,
        subjectId,
        outcome: 'confirmado',
        createdAt: MoreThan(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)),
      },
    });
    if (count >= 3) {
      this.realtime.emitToJefes({
        type: 'discipline.risk.report_threshold',
        subjectType,
        subjectId,
        confirmedReportsIn90Days: count,
      });
    }
  }

  private async refreshPublicEmployeeRating(
    employeeId: string,
    direction: RatingDirection,
  ) {
    if (direction !== 'client_to_employee') return;
    await this.dataSource.query(
      `UPDATE empleadas e
       SET promedio_calificacion = metric.average,
           total_servicios_valorados = metric.count
       FROM (
         SELECT ROUND(AVG(stars)::numeric, 2) AS average, COUNT(*)::int AS count
         FROM interaction_ratings
         WHERE employee_id = $1 AND direction = 'client_to_employee'
       ) metric
       WHERE e.id = $1`,
      [employeeId],
    );
  }

  private async expireSanctions() {
    const result = await this.sanctions
      .createQueryBuilder()
      .update()
      .set({ status: 'expired' })
      .where("status = 'active'")
      .andWhere("type = 'suspension'")
      .andWhere('ends_at IS NOT NULL AND ends_at <= now()')
      .returning(['id', 'subjectType', 'subjectId'])
      .execute();
    for (const sanction of result.raw ?? []) {
      this.realtime.emitToJefes({
        type: 'discipline.sanction.expired',
        sanctionId: sanction.id,
        subjectType: sanction.subject_type,
        subjectId: sanction.subject_id,
      });
    }
  }

  private async assertPersonExists(type: PersonType, id: string) {
    const table =
      type === 'client'
        ? 'clientes'
        : type === 'employee'
          ? 'empleadas'
          : 'choferes';
    const rows = await this.dataSource.query(
      `SELECT id FROM ${table} WHERE id = $1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('Persona no encontrada');
  }

  private async setOperationalUserActive(
    type: 'employee' | 'driver',
    id: string,
    active: boolean,
  ) {
    const table = type === 'employee' ? 'empleadas' : 'choferes';
    await this.dataSource.query(
      `UPDATE usuarios SET activo = $2
       WHERE id = (SELECT usuario_id FROM ${table} WHERE id = $1)`,
      [id, active],
    );
  }

  private async assertBossScope(
    bossId: string,
    subjectType: PersonType,
    subjectId: string,
  ) {
    const rows = await this.dataSource.query(
      `SELECT 1
       WHERE
         ($2 = 'employee' AND EXISTS (
           SELECT 1 FROM empleadas e WHERE e.id = $3 AND e.jefe_id = $1
         ))
         OR EXISTS (
           SELECT 1 FROM conduct_reports r
           JOIN servicios s ON s.id = r.service_id
           WHERE r.subject_type = $2 AND r.subject_id = $3 AND s.jefe_id = $1
         )`,
      [bossId, subjectType, subjectId],
    );
    if (!rows[0]) {
      throw new ForbiddenException('El expediente no pertenece a su operación');
    }
  }

  private emitDisciplineEvent(
    interaction: ResolvedInteraction,
    type: string,
    payload: Record<string, unknown>,
  ) {
    const event = { type, ...payload };
    this.realtime.emitToBoss(interaction.bossId, event);
    this.realtime.emitToEmployee(interaction.employeeId, event);
    if (interaction.driverId) {
      this.realtime.emitToDriver(interaction.driverId, event);
    }
    this.realtime.emitToClient(interaction.clientId, event);
  }

  private assertAdmin(actor: Actor) {
    if (actor.rol !== 'admin') {
      throw new ForbiddenException('Solo un administrador puede realizar esta acción');
    }
  }
}
