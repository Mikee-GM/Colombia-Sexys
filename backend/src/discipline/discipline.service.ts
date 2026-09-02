import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { NotificationsService } from '../notifications/notifications.service';
import { AVISO_SANCION } from '../notifications/avisos-catalogo';
import {
  InteractionRating,
  RatingDirection,
} from './entities/interaction-rating.entity';

type PersonType = 'client' | 'employee' | 'driver' | 'boss';
type ReportPersonType = 'client' | 'employee' | 'driver';

/**
 * Columna de `interaction_ratings` que identifica a cada tipo de persona.
 *
 * El mapeo estaba escrito como un ternario repetido en cada consulta cruda, asi
 * que anadir un tipo obligaba a recordar todos los sitios. Al declararlo como
 * `Record<ReportPersonType, ...>` es el compilador quien exige la entrada nueva.
 * `boss` queda fuera a proposito: no se le califica.
 */
const RATING_SUBJECT_COLUMN: Record<ReportPersonType, string> = {
  client: 'client_id',
  employee: 'employee_id',
  driver: 'driver_id',
};
type Actor = { id: string; rol: 'jefe' | 'empleada' | 'chofer' | 'admin' };
type ResolvedInteraction = {
  serviceId: string | null;
  tripId: string | null;
  clientId: string;
  employeeId: string;
  driverId: string | null;
  reporterType: ReportPersonType;
  reporterId: string;
  subjectType: ReportPersonType;
  subjectId: string;
  bossId: string;
  finishedAt: Date;
};

@Injectable()
export class DisciplineService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DisciplineService.name);

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
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeEventsService,
    private readonly configService: ConfigService,
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
      await this.refreshPublicEmployeeRating(
        interaction.employeeId,
        dto.direction,
      );
      await this.evaluateRatingThreshold(
        interaction.subjectType,
        interaction.subjectId,
        dto.direction,
      );
      if (
        interaction.subjectType === 'employee' ||
        interaction.subjectType === 'driver'
      ) {
        await this.evaluateLowScoreThreshold(
          interaction.subjectType,
          interaction.subjectId,
        );
      }
      this.emitDisciplineEvent(interaction, 'discipline.rating.created', {
        ratingId: saved.id,
        direction: saved.direction,
      });

      /*
       * Nivel 2 para quien recibe la nota.
       *
       * Se avisa al sujeto de la calificacion, no a quien la puso: `subjectType`
       * es precisamente el que la recibe. Le importa --afecta a su reputacion y
       * a su posicion-- pero no cambia nada de lo que este haciendo ahora.
       */
      if (
        interaction.subjectType === 'employee' ||
        interaction.subjectType === 'driver'
      ) {
        const usuarioId = await this.usuarioDelSujeto(
          interaction.subjectType,
          interaction.subjectId,
        );
        await this.avisar(usuarioId, interaction.subjectType, {
          titulo: 'Te calificaron',
          cuerpo: `Recibiste ${dto.stars} ${dto.stars === 1 ? 'estrella' : 'estrellas'}. Toca para verlo.`,
          tag: `calificacion-${saved.id}`,
        });
      }
      if (dto.direction === 'client_to_employee' && dto.stars <= 2) {
        await this.autoCreateReportFromBadRating(dto, interaction, saved.id);
      }
      return saved;
    } catch (error: any) {
      if (error?.code === '23505') {
        throw new ConflictException('Esta interacción ya fue calificada');
      }
      throw error;
    }
  }

  private async autoCreateReportFromBadRating(
    dto: CreateRatingDto,
    interaction: ResolvedInteraction,
    ratingId: string,
  ) {
    try {
      const report = this.reports.create({
        direction: dto.direction,
        reporterType: 'client',
        reporterId: interaction.clientId,
        subjectType: 'employee',
        subjectId: interaction.employeeId,
        serviceId: interaction.serviceId,
        tripId: interaction.tripId,
        category: 'otro',
        description: (dto.comment || '').trim(),
        priority: 'normal',
        history: [
          {
            at: new Date().toISOString(),
            action: 'created',
            actorType: 'client',
            actorId: interaction.clientId,
            automatic: true,
            ratingId,
          },
        ],
      });
      await this.reports.save(report);
    } catch (error: any) {
      if (error?.code !== '23505') throw error;
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
      throw new ForbiddenException(
        'No puede consultar reportes disciplinarios',
      );
    }
    return query.orderBy('report.createdAt', 'DESC').getMany();
  }

  async closeReport(id: string, dto: CloseConductReportDto, admin: Actor) {
    const report = await this.reports.findOneBy({ id });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    if (admin.rol !== 'admin') {
      if (admin.rol !== 'jefe') {
        throw new ForbiddenException(
          'Solo un administrador o jefe puede realizar esta acción',
        );
      }
      await this.assertReportBossScope(report, admin.id);
    }
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
        actorType: admin.rol,
        actorId: admin.id,
      },
    ];
    const saved = await this.reports.save(report);
    if (dto.outcome === 'confirmado') {
      await this.evaluateConfirmedReportThreshold(
        report.subjectType,
        report.subjectId,
      );
      if (
        report.subjectType === 'employee' ||
        report.subjectType === 'driver'
      ) {
        await this.evaluateLowScoreThreshold(
          report.subjectType,
          report.subjectId,
        );
      }
    }
    this.realtime.emitToJefes({
      type: 'discipline.report.closed',
      reportId: report.id,
      outcome: report.outcome,
    });
    return saved;
  }

  /**
   * El usuario que hay detras de una empleada o un chofer.
   *
   * Las sanciones y las calificaciones razonan sobre la persona operativa, pero
   * un aviso se manda a su cuenta. Se resuelve como ya lo hace el resto del
   * servicio: leyendo `usuario_id` de su tabla.
   */
  private async usuarioDelSujeto(
    tipo: string,
    sujetoId: string,
  ): Promise<string | null> {
    if (tipo !== 'employee' && tipo !== 'driver') return null;
    const tabla = tipo === 'employee' ? 'empleadas' : 'choferes';
    const filas = await this.dataSource.query(
      `SELECT usuario_id FROM ${tabla} WHERE id = $1`,
      [sujetoId],
    );
    return filas[0]?.usuario_id ?? null;
  }

  /**
   * Manda un aviso push sin que su fallo arrastre a nada.
   *
   * La sancion ya esta puesta y la calificacion ya esta guardada cuando esto se
   * llama: un aviso que no sale se registra y se sigue.
   */
  private async avisar(
    usuarioId: string | null,
    tipo: 'employee' | 'driver',
    aviso: { titulo: string; cuerpo: string; tag: string },
  ): Promise<void> {
    if (!usuarioId) return;
    try {
      await this.notifications.notificar(usuarioId, {
        ...aviso,
        tipo: AVISO_SANCION,
        url: tipo === 'employee' ? '/empleada/portal' : '/chofer/portal',
      });
    } catch (err) {
      this.logger.error(`Error enviando el aviso push "${aviso.titulo}":`, err);
    }
  }

  async createSanction(dto: CreateSanctionDto, admin: Actor) {
    this.assertAdmin(admin);
    return this.persistSanction(dto, admin.id);
  }

  /**
   * Bloquea a un cliente, y esto si puede hacerlo un jefe.
   *
   * Sancionar a una empleada o a un chofer sigue siendo cosa de
   * administracion, porque afecta a su sustento. Un cliente es otra cosa: el
   * jefe es quien lidia con el en el momento en que pasa algo, y hacerle
   * esperar a que un admin este disponible significa que el cliente sigue
   * escribiendole a las modelos mientras tanto.
   */
  async blockClient(
    clienteId: string,
    actor: Actor,
    input: { reason: string; endsAt?: string; conductReportId?: string },
  ) {
    if (actor.rol !== 'admin' && actor.rol !== 'jefe') {
      throw new ForbiddenException(
        'Solo un jefe o un administrador puede bloquear a un cliente',
      );
    }
    return this.persistSanction(
      {
        subjectType: 'client',
        subjectId: clienteId,
        // Sin fecha final es un bloqueo definitivo; con ella, una suspension.
        type: input.endsAt ? 'suspension' : 'permanent_ban',
        reason: input.reason,
        endsAt: input.endsAt,
        conductReportId: input.conductReportId,
      },
      actor.id,
    );
  }

  /** Levanta todos los bloqueos activos de un cliente. */
  async unblockClient(clienteId: string, actor: Actor, reason: string) {
    if (actor.rol !== 'admin' && actor.rol !== 'jefe') {
      throw new ForbiddenException(
        'Solo un jefe o un administrador puede levantar el bloqueo',
      );
    }
    if (!reason?.trim()) {
      throw new BadRequestException('Explica por qué se levanta el bloqueo');
    }
    const activas = await this.sanctions.find({
      where: { subjectType: 'client', subjectId: clienteId, status: 'active' },
    });
    for (const sancion of activas) {
      sancion.status = 'revoked';
      sancion.revokedAt = new Date();
      sancion.revokedByUserId = actor.id;
      sancion.revocationReason = reason.trim();
    }
    if (activas.length) await this.sanctions.save(activas);
    this.realtime.emitToJefes({
      type: 'discipline.client.unblocked',
      subjectId: clienteId,
      levantadas: activas.length,
    });
    return { levantadas: activas.length };
  }

  private async persistSanction(dto: CreateSanctionDto, actorId: string) {
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (dto.type === 'suspension' && (!endsAt || endsAt <= startsAt)) {
      throw new BadRequestException(
        'La suspensión requiere una fecha final posterior al inicio',
      );
    }
    if (
      dto.type === 'fine' &&
      (!dto.fineAmount || Number(dto.fineAmount) <= 0)
    ) {
      throw new BadRequestException('La multa requiere un monto mayor a 0');
    }
    await this.assertPersonExists(dto.subjectType, dto.subjectId);
    const sanction = await this.sanctions.save(
      this.sanctions.create({
        subjectType: dto.subjectType,
        subjectId: dto.subjectId,
        type: dto.type,
        fineAmount: dto.type === 'fine' ? Number(dto.fineAmount) : null,
        reason: dto.reason.trim(),
        conductReportId: dto.conductReportId ?? null,
        createdByUserId: actorId,
        startsAt,
        endsAt,
      }),
    );
    if (
      dto.type === 'permanent_ban' &&
      (dto.subjectType === 'employee' || dto.subjectType === 'driver')
    ) {
      await this.setOperationalUserActive(
        dto.subjectType,
        dto.subjectId,
        false,
      );
    }
    if (
      (dto.type === 'suspension' || dto.type === 'permanent_ban') &&
      dto.subjectType === 'boss'
    ) {
      await this.dataSource.query(
        `UPDATE usuarios SET activo = false WHERE id = $1`,
        [dto.subjectId],
      );
    }
    if (
      (dto.type === 'suspension' || dto.type === 'permanent_ban') &&
      (dto.subjectType === 'employee' || dto.subjectType === 'driver')
    ) {
      await this.setOperationalAvailability(
        dto.subjectType,
        dto.subjectId,
        false,
      );
    }
    /*
     * Nivel 2: le afecta al bolsillo o le impide trabajar, asi que tiene que
     * enterarse, pero no es algo que resuelva en el momento.
     */
    if (dto.subjectType === 'employee' || dto.subjectType === 'driver') {
      const usuarioId = await this.usuarioDelSujeto(
        dto.subjectType,
        dto.subjectId,
      );
      await this.avisar(usuarioId, dto.subjectType, {
        titulo:
          dto.type === 'fine' ? 'Se te aplicó una multa' : 'Tienes una sanción',
        cuerpo: 'Toca para ver el detalle en tu portal.',
        tag: `sancion-${sanction.id}`,
      });
    }

    if (dto.type === 'fine' && dto.subjectType === 'employee') {
      await this.dataSource.getRepository('LiquidationRecord').save({
        employeeId: dto.subjectId,
        registeredByUserId: actorId,
        sourceRole: 'admin',
        occurredAt: startsAt,
        serviceTotal: 0,
        paymentMethod: 'efectivo',
        cashAmount: 0,
        cardAmounts: [],
        companyPercentage: 0,
        extraAmount: 0,
        promotion: false,
        membershipAmount: 0,
        companyTransportExpense: 0,
        customerTransportCharge: 0,
        employeeUberReimbursement: 0,
        employeeCashDue: 0,
        electronicExtraAmount: 0,
        cardExtraAmount: 0,
        transportExcess: 0,
        place: `Multa: ${dto.reason.trim()}`,
        hasOutboundDriver: false,
        hasReturnDriver: false,
        cancelled: false,
        isFine: true,
        fineAmount: Number(dto.fineAmount),
      });
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
      (sanction.type === 'permanent_ban' || sanction.type === 'suspension') &&
      sanction.subjectType === 'boss'
    ) {
      const remaining = await this.getActiveSanction(
        sanction.subjectType,
        sanction.subjectId,
      );
      if (!remaining) {
        await this.dataSource.query(
          `UPDATE usuarios SET activo = true WHERE id = $1`,
          [sanction.subjectId],
        );
      }
    }
    if (
      (sanction.type === 'permanent_ban' || sanction.type === 'suspension') &&
      (sanction.subjectType === 'employee' || sanction.subjectType === 'driver')
    ) {
      const remaining = await this.getActiveSanction(
        sanction.subjectType,
        sanction.subjectId,
      );
      if (!remaining) {
        if (sanction.type === 'permanent_ban') {
          await this.setOperationalUserActive(
            sanction.subjectType,
            sanction.subjectId,
            true,
          );
        }
        await this.setOperationalAvailability(
          sanction.subjectType,
          sanction.subjectId,
          true,
        );
      }
    }
    if (sanction.type === 'fine' && sanction.subjectType === 'employee') {
      await this.dataSource
        .createQueryBuilder()
        .delete()
        .from('liquidation_records')
        .where(
          'employee_id = :empId AND is_fine = true AND fine_amount = :amt AND place LIKE :plc',
          {
            empId: sanction.subjectId,
            amt: sanction.fineAmount,
            plc: `%${sanction.reason.trim()}%`,
          },
        )
        .execute();
    }
    this.realtime.emitToJefes({
      type: 'discipline.sanction.revoked',
      sanctionId: sanction.id,
    });
    return saved;
  }

  async listSanctions(
    actor: Actor,
    subjectType?: PersonType,
    subjectId?: string,
  ) {
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

  async getDossier(actor: Actor, subjectType: PersonType, subjectId: string) {
    if (actor.rol !== 'admin' && actor.rol !== 'jefe') {
      throw new ForbiddenException('No puede consultar expedientes');
    }
    if (actor.rol === 'jefe') {
      await this.assertBossScope(actor.id, subjectType, subjectId);
    }
    const [ratings, reports, sanctions] = await Promise.all([
      this.ratingSummary(subjectType, subjectId),
      subjectType === 'boss'
        ? Promise.resolve([])
        : this.reports.find({
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
      throw new ForbiddenException(
        'No hay reputación interna para este usuario',
      );
    }
    return {
      subjectType: identity.type,
      subjectId: identity.id,
      ratings: await this.ratingSummary(identity.type, identity.id),
      sanction: await this.getActiveSanction(identity.type, identity.id),
    };
  }

  async listOwnAppealableRatings(subjectType: PersonType, subjectId: string) {
    if (subjectType === 'boss') return [];
    const column = RATING_SUBJECT_COLUMN[subjectType];
    return this.dataSource.query(
      `SELECT id, direction, stars, comment, created_at AS "createdAt"
       FROM interaction_ratings
       WHERE ${column} = $1
         AND direction::text LIKE $2
         AND stars <= 3
         AND appeal_status = 'none'
       ORDER BY created_at DESC
       LIMIT 5`,
      [subjectId, `%_to_${subjectType}`],
    );
  }

  /**
   * Las calificaciones que esta persona todavia puede apelar.
   *
   * La identidad sale del actor y no de un parametro: si viniera del cliente,
   * cualquiera podria pedir las de otro. Es la misma razon por la que
   * `apelarPropia` no acepta un sujeto.
   */
  async listarApelablesPropias(actor: Actor) {
    const identity = await this.identityForActor(actor);
    if (!identity || identity.type === 'client' || identity.type === 'boss') {
      throw new ForbiddenException('No tienes calificaciones que apelar');
    }
    return this.listOwnAppealableRatings(identity.type, identity.id);
  }

  /**
   * Apela una calificacion propia.
   *
   * Existia solo detras del boton del chat, asi que quien no usa Telegram no
   * tenia forma de defenderse de una calificacion baja --y una calificacion
   * baja alimenta el score de confianza y puede acabar en sancion--.
   */
  async apelarPropia(actor: Actor, ratingId: string, reason: string) {
    const identity = await this.identityForActor(actor);
    if (!identity || identity.type === 'client' || identity.type === 'boss') {
      throw new ForbiddenException('No tienes calificaciones que apelar');
    }
    return this.appealRating(identity.type, identity.id, ratingId, reason);
  }

  async appealRating(
    subjectType: PersonType,
    subjectId: string,
    ratingId: string,
    reason: string,
  ) {
    const rating = await this.ratings.findOneBy({ id: ratingId });
    if (!rating) throw new NotFoundException('Calificación no encontrada');
    const subjectColumnValue = rating.direction.endsWith('_to_employee')
      ? rating.employeeId
      : rating.direction.endsWith('_to_client')
        ? rating.clientId
        : rating.driverId;
    if (subjectColumnValue !== subjectId) {
      throw new ForbiddenException('Esta calificación no te pertenece');
    }
    if (rating.appealStatus !== 'none') {
      throw new ConflictException('Esta calificación ya fue apelada');
    }
    rating.appealStatus = 'pending';
    rating.appealReason = reason.trim().slice(0, 2000);
    const saved = await this.ratings.save(rating);
    if (rating.direction === 'client_to_employee' && rating.employeeId) {
      await this.refreshPublicEmployeeRating(
        rating.employeeId,
        rating.direction,
      );
    }
    this.realtime.emitToJefes({
      type: 'discipline.rating.appealed',
      ratingId,
      subjectType,
      subjectId,
    });
    return saved;
  }

  async listPendingAppeals() {
    return this.ratings.find({
      where: { appealStatus: 'pending' },
      order: { createdAt: 'DESC' },
    });
  }

  async resolveAppeal(
    ratingId: string,
    decision: 'upheld' | 'overturned',
    admin: Actor,
  ) {
    this.assertAdmin(admin);
    const rating = await this.ratings.findOneBy({ id: ratingId });
    if (!rating) throw new NotFoundException('Calificación no encontrada');
    if (rating.appealStatus !== 'pending') {
      throw new ConflictException(
        'Esta calificación no tiene una apelación pendiente',
      );
    }
    rating.appealStatus = decision;
    rating.appealResolvedAt = new Date();
    rating.appealResolvedByUserId = admin.id;
    const saved = await this.ratings.save(rating);
    if (rating.direction === 'client_to_employee' && rating.employeeId) {
      await this.refreshPublicEmployeeRating(
        rating.employeeId,
        rating.direction,
      );
    }
    return saved;
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

  async assertOperationallyAllowed(subjectType: PersonType, subjectId: string) {
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
      direction === 'driver_to_employee' || direction === 'employee_to_driver';
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
    const finished = usesTrip
      ? row.trip_status === 'finalizado'
      : row.service_status === 'finalizado';
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
      { reporterType: ReportPersonType; subjectType: ReportPersonType }
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
      boss: row.boss_id,
    };
    if (actorType !== definition.reporterType || ids[actorType] !== actorId) {
      throw new ForbiddenException('No pertenece a esta interacción');
    }
    const subjectId = ids[definition.subjectType];
    if (!subjectId)
      throw new BadRequestException('La interacción no tiene sujeto');
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
    if (actor.rol === 'jefe') {
      return { type: 'boss', id: actor.id };
    }
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
    if (subjectType === 'boss') return [];
    const column = RATING_SUBJECT_COLUMN[subjectType];
    return this.dataSource.query(
      `SELECT direction,
              ROUND(AVG(stars)::numeric, 2)::float AS average,
              COUNT(*)::int AS count
       FROM interaction_ratings
       WHERE ${column} = $1
         AND direction::text LIKE $2
         AND appeal_status NOT IN ('pending', 'overturned')
       GROUP BY direction ORDER BY direction`,
      [subjectId, `%_to_${subjectType}`],
    );
  }

  private async evaluateRatingThreshold(
    subjectType: PersonType,
    subjectId: string,
    direction: RatingDirection,
  ) {
    if (subjectType === 'boss') return;
    const column = RATING_SUBJECT_COLUMN[subjectType];
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
    if (subjectType === 'boss') return;
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
      if (
        count === 3 &&
        (subjectType === 'employee' || subjectType === 'driver')
      ) {
        await this.applyAutomaticSuspension(
          subjectType,
          subjectId,
          'Suspensión automática por acumular 3 reportes confirmados en los últimos 90 días.',
        );
      }
    }
  }

  /**
   * Bloqueo automático ligado al desempeño general (no solo al conteo de reportes):
   * si el score de una empleada o chofer (el mismo usado en los KPIs: calificación −
   * reportes confirmados) cae por debajo del umbral configurado, se suspende igual
   * que con el umbral de 3 reportes.
   */
  private async evaluateLowScoreThreshold(
    subjectType: 'employee' | 'driver',
    subjectId: string,
  ) {
    const ratingDirection =
      subjectType === 'employee' ? 'client_to_employee' : 'employee_to_driver';
    const ratingColumn =
      subjectType === 'employee' ? 'employee_id' : 'driver_id';
    const appealFilter =
      subjectType === 'employee'
        ? "AND appeal_status NOT IN ('pending','overturned')"
        : '';
    const [row] = await this.dataSource.query(
      `SELECT
         (SELECT AVG(stars) FROM interaction_ratings
           WHERE direction = $1 AND ${ratingColumn} = $2 ${appealFilter}) AS avg_stars,
         (SELECT COUNT(*) FROM conduct_reports
           WHERE subject_type = $3 AND subject_id = $2 AND outcome = 'confirmado'
             AND created_at >= now() - interval '90 days') AS confirmed`,
      [ratingDirection, subjectId, subjectType],
    );
    if (row.avg_stars == null) return; // sin calificaciones aún, no hay score que evaluar
    const score = Math.max(
      0,
      Math.round((Number(row.avg_stars) / 5) * 100 - Number(row.confirmed) * 8),
    );
    const threshold = this.configService.get<number>(
      'DISCIPLINE_LOW_SCORE_SUSPENSION_THRESHOLD',
      20,
    );
    if (score < threshold) {
      await this.applyAutomaticSuspension(
        subjectType,
        subjectId,
        `Suspensión automática por desempeño por debajo del umbral (score ${score}/100, mínimo ${threshold}).`,
      );
    }
  }

  /**
   * Multa automatica a un chofer por rechazar ofertas seguidas.
   *
   * No pasa por `createSanction` porque aquella exige un admin que la firme, y
   * esta la levanta el sistema. Comparte todo lo demas: la misma tabla de
   * sanciones, el mismo tipo `fine` y el mismo evento en tiempo real, de modo
   * que aparece en el panel junto a las demas y el admin puede revocarla.
   *
   * No suspende: rechazar no es una falta grave, y dejar sin trabajar a un
   * chofer agrava el problema que se quiere evitar, que es quedarse sin quien
   * cubra los viajes.
   */
  async applyDriverRejectionFine(
    driverId: string,
    rechazosSeguidos: number,
    amount: number,
  ) {
    const sanction = await this.sanctions.save(
      this.sanctions.create({
        subjectType: 'driver',
        subjectId: driverId,
        type: 'fine',
        fineAmount: amount,
        reason: `Multa automática por rechazar ${rechazosSeguidos} ofertas de viaje seguidas.`,
        startsAt: new Date(),
        endsAt: null,
      }),
    );
    this.realtime.emitToJefes({
      type: 'discipline.sanction.applied',
      sanctionId: sanction.id,
      subjectType: 'driver',
      subjectId: driverId,
      automatic: true,
    });
    return sanction;
  }

  private async applyAutomaticSuspension(
    subjectType: 'employee' | 'driver',
    subjectId: string,
    reason: string,
  ) {
    const active = await this.getActiveSanction(subjectType, subjectId);
    if (active) return;
    const startsAt = new Date();
    const endsAt = new Date(startsAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sanction = await this.sanctions.save(
      this.sanctions.create({
        subjectType,
        subjectId,
        type: 'suspension',
        reason,
        startsAt,
        endsAt,
      }),
    );
    await this.setOperationalAvailability(subjectType, subjectId, false);
    this.realtime.emitToJefes({
      type: 'discipline.sanction.applied',
      sanctionId: sanction.id,
      subjectType: sanction.subjectType,
      subjectId: sanction.subjectId,
      automatic: true,
    });
  }

  private async refreshPublicEmployeeRating(
    employeeId: string,
    direction: RatingDirection,
  ) {
    if (direction !== 'client_to_employee') return;
    const [metric] = await this.dataSource.query(
      `SELECT ROUND(AVG(stars)::numeric, 2) AS average, COUNT(*)::int AS count
       FROM interaction_ratings
       WHERE employee_id = $1 AND direction = 'client_to_employee'
         AND appeal_status NOT IN ('pending', 'overturned')`,
      [employeeId],
    );
    await this.dataSource.query(
      `UPDATE empleadas
       SET promedio_calificacion = $2, total_servicios_valorados = $3
       WHERE id = $1`,
      [employeeId, metric.average, metric.count],
    );
    // Se conserva un registro histórico de cada recálculo del promedio, para poder
    // reconstruir cómo cambió la calificación pública de una empleada con el tiempo.
    await this.dataSource.query(
      `INSERT INTO employee_rating_snapshots (employee_id, average, rating_count)
       VALUES ($1, $2, $3)`,
      [employeeId, metric.average, metric.count],
    );
  }

  async listRatingHistory(employeeId: string) {
    return this.dataSource.query(
      `SELECT id, average, rating_count AS "ratingCount", created_at AS "createdAt"
       FROM employee_rating_snapshots
       WHERE employee_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [employeeId],
    );
  }

  async listEmployeeRatingComments(employeeId: string) {
    return this.dataSource.query(
      `SELECT stars, comment, created_at AS "createdAt"
       FROM interaction_ratings
       WHERE employee_id = $1
         AND direction = 'client_to_employee'
         AND comment IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 20`,
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
      const subjectType = sanction.subject_type as PersonType;
      const subjectId = sanction.subject_id as string;
      if (subjectType === 'employee' || subjectType === 'driver') {
        const remaining = await this.getActiveSanction(subjectType, subjectId);
        if (!remaining) {
          await this.setOperationalAvailability(subjectType, subjectId, true);
        }
      }
      if (subjectType === 'boss') {
        const remaining = await this.getActiveSanction(subjectType, subjectId);
        if (!remaining) {
          await this.dataSource.query(
            `UPDATE usuarios SET activo = true WHERE id = $1`,
            [subjectId],
          );
        }
      }
      this.realtime.emitToJefes({
        type: 'discipline.sanction.expired',
        sanctionId: sanction.id,
        subjectType: sanction.subject_type,
        subjectId: sanction.subject_id,
      });
    }
  }

  private async assertPersonExists(type: PersonType, id: string) {
    if (type === 'boss') {
      const rows = await this.dataSource.query(
        `SELECT id FROM usuarios WHERE id = $1 AND rol IN ('jefe', 'admin')`,
        [id],
      );
      if (!rows[0]) throw new NotFoundException('Jefe no encontrado');
      return;
    }
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

  private async setOperationalAvailability(
    type: 'employee' | 'driver',
    id: string,
    disponible: boolean,
  ) {
    const table = type === 'employee' ? 'empleadas' : 'choferes';
    await this.dataSource.query(
      `UPDATE ${table} SET disponible = $2 WHERE id = $1`,
      [id, disponible],
    );
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
         ($2 = 'boss' AND $3 = $1)
         OR ($2 = 'employee' AND EXISTS (
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

  private async assertReportBossScope(report: ConductReport, bossId: string) {
    if (!report.serviceId) {
      throw new ForbiddenException('Este reporte no pertenece a su operación');
    }
    const rows = await this.dataSource.query(
      `SELECT 1 FROM servicios s WHERE s.id = $1 AND s.jefe_id = $2`,
      [report.serviceId, bossId],
    );
    if (!rows[0]) {
      throw new ForbiddenException('Este reporte no pertenece a su operación');
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
      throw new ForbiddenException(
        'Solo un administrador puede realizar esta acción',
      );
    }
  }
}
