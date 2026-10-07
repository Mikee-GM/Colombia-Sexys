import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectBot } from 'nestjs-telegraf';
import { In, IsNull, LessThan, Repository } from 'typeorm';
import { Context, Telegraf } from 'telegraf';
import { ConversacionesTelegram } from './entities/telegram-conversation.entity';
import { Servicios } from '../services/entities/service.entity';
import { Usuarios } from '../users/entities/user.entity';
import { RealtimeEventsService } from '../realtime/realtime.service';
import { TelegramSession } from '../telegram/entities/telegram-session.entity';
import { Clientes } from '../clients/entities/client.entity';
import { parseSessionKey } from '../telegram/telegram-session.key';
import { Empleadas } from '../employees/entities/employee.entity';
import { CustomerBookingSession } from './entities/customer-booking-session.entity';
import { ServicesService } from '../services/services.service';
import type { UpdateBookingDraftDto } from './dto/update-booking-draft.dto';

type PreServiceBookingData = {
  durationHours: number | null;
  openEndedDuration: boolean;
  paymentMethod: string | null;
  locationName: string | null;
  locationAddress: string | null;
  locationNotes: string | null;
  locationLat: number | null;
  locationLng: number | null;
  placeType: string | null;
  room: string | null;
  scheduleType: string | null;
  scheduledAt: string | null;
  currentRequirement: string | null;
  status: string;
  version: number;
};

@Injectable()
export class TelegramConversationsService {
  constructor(
    @InjectRepository(ConversacionesTelegram)
    private readonly conversationsRepository: Repository<ConversacionesTelegram>,
    @InjectRepository(Servicios)
    private readonly servicesRepository: Repository<Servicios>,
    @InjectRepository(TelegramSession)
    private readonly telegramSessionRepository: Repository<TelegramSession>,
    @InjectRepository(Clientes)
    private readonly clientesRepository: Repository<Clientes>,
    @InjectRepository(CustomerBookingSession)
    private readonly bookingDraftRepository: Repository<CustomerBookingSession>,
    @InjectRepository(Empleadas)
    private readonly empleadasRepository: Repository<Empleadas>,
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly realtimeEvents: RealtimeEventsService,
    @Inject(forwardRef(() => ServicesService))
    private readonly servicesService: ServicesService,
  ) {}

  /**
   * Synchronizes the transport session into the durable booking draft.
   *
   * The version predicate is important: an AI update that started before a
   * boss edit is rejected instead of overwriting the boss' newer values.
   */
  async upsertBookingDraftFromSession(
    bookingSessionId: string | undefined,
    clientId: string | undefined,
    session: Record<string, unknown>,
  ): Promise<CustomerBookingSession | null> {
    if (!bookingSessionId || !clientId) return null;
    let draft = await this.bookingDraftRepository.findOne({
      where: { id: bookingSessionId },
    });
    if (!draft) {
      draft = this.bookingDraftRepository.create({
        id: bookingSessionId,
        clientId,
        intendedEmployeeId: this.stringValue(session.empleadaId),
        ownerBossId: null,
        status: this.draftStatus(session),
        durationHours: this.numberValue(session.duracionPactadaHoras),
        openEndedDuration: session.duracionIndefinida === true,
        placeType: session.presetLocationId ? 'preset' : 'external',
        presetLocationId: this.stringValue(session.presetLocationId),
        locationName: this.stringValue(session.locationNameSnapshot),
        locationAddress: this.stringValue(session.locationAddressSnapshot),
        locationNotes: this.stringValue(session.locationNotas),
        locationLat: this.finiteNumberValue(session.locationLat),
        locationLng: this.finiteNumberValue(session.locationLng),
        room: null,
        paymentMethod: this.paymentValue(session.metodoPago),
        scheduleType:
          session.tipoAgenda === 'programado' ? 'programado' : 'inmediato',
        scheduledAt: this.dateValue(session.fechaProgramada),
        currentRequirement: this.stringValue(session.step),
        mode:
          session.iaActiva === false || session.humanTakeover
            ? 'HUMAN_ACTIVE'
            : 'AI_ACTIVE',
        serviceId: this.stringValue(session.bookingServiceId),
        version: 1,
        metadata: {},
        lastInteractionAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      if (draft.intendedEmployeeId) {
        const employee = await this.empleadasRepository.findOne({
          where: { id: draft.intendedEmployeeId },
        });
        draft.ownerBossId = employee?.jefeId ?? null;
      }
      const saved = await this.bookingDraftRepository.save(draft);
      session.bookingDraftVersion = saved.version;
      return saved;
    }

    const expectedVersion = this.numberValue(session.bookingDraftVersion);
    if (expectedVersion !== null && expectedVersion !== draft.version) {
      session.bookingDraftVersion = draft.version;
      return draft;
    }
    if (draft.mode === 'HUMAN_ACTIVE' && session.iaActiva === false) {
      session.bookingDraftVersion = draft.version;
      return draft;
    }

    const employeeId = this.stringValue(session.empleadaId);
    const employee = employeeId
      ? await this.empleadasRepository.findOne({ where: { id: employeeId } })
      : null;
    const nextVersion = draft.version + 1;
    const result = await this.bookingDraftRepository
      .createQueryBuilder()
      .update(CustomerBookingSession)
      .set({
        clientId,
        intendedEmployeeId: employeeId,
        ownerBossId: employee?.jefeId ?? draft.ownerBossId,
        status: this.draftStatus(session),
        durationHours: this.numberValue(session.duracionPactadaHoras),
        openEndedDuration: session.duracionIndefinida === true,
        placeType: session.presetLocationId ? 'preset' : 'external',
        presetLocationId: this.stringValue(session.presetLocationId),
        locationName: this.stringValue(session.locationNameSnapshot),
        locationAddress: this.stringValue(session.locationAddressSnapshot),
        locationNotes: this.stringValue(session.locationNotas),
        locationLat: this.finiteNumberValue(session.locationLat),
        locationLng: this.finiteNumberValue(session.locationLng),
        paymentMethod: this.paymentValue(session.metodoPago),
        scheduleType:
          session.tipoAgenda === 'programado' ? 'programado' : 'inmediato',
        scheduledAt: this.dateValue(session.fechaProgramada),
        currentRequirement: this.stringValue(session.step),
        mode:
          session.iaActiva === false || session.humanTakeover
            ? 'HUMAN_ACTIVE'
            : 'AI_ACTIVE',
        serviceId: this.stringValue(session.bookingServiceId),
        version: nextVersion,
        lastInteractionAt: new Date(),
        updatedAt: new Date(),
      })
      .where('id = :id AND version = :version', {
        id: draft.id,
        version: draft.version,
      })
      .execute();
    if (!result.affected) {
      const current = await this.bookingDraftRepository.findOneBy({
        id: draft.id,
      });
      if (current) session.bookingDraftVersion = current.version;
      return current;
    }
    const saved = await this.bookingDraftRepository.findOneBy({ id: draft.id });
    if (saved) session.bookingDraftVersion = saved.version;
    return saved;
  }

  async getBookingDraft(
    bookingSessionId: string,
  ): Promise<CustomerBookingSession> {
    const draft = await this.bookingDraftRepository.findOne({
      where: { id: bookingSessionId },
    });
    if (!draft)
      throw new NotFoundException('Borrador de reserva no encontrado');
    return draft;
  }

  async markBookingDraftReady(
    bookingSessionId: string,
    receiptValidationId?: string,
  ) {
    const draft = await this.getBookingDraft(bookingSessionId);
    if (draft.serviceId) return this.serializeDraft(draft);
    draft.status = 'READY';
    draft.currentRequirement = null;
    draft.version += 1;
    draft.metadata = {
      ...draft.metadata,
      ...(receiptValidationId ? { receiptValidationId } : {}),
    };
    draft.updatedAt = new Date();
    const saved = await this.bookingDraftRepository.save(draft);
    await this.syncDraftToTelegramSessions(saved);
    return this.serializeDraft(saved);
  }

  /** Applies boss-edited persisted fields before the bot handles a new update. */
  hydrateSessionFromBookingDraft(
    session: Record<string, unknown>,
    draft: CustomerBookingSession,
  ): void {
    session.bookingDraftVersion = draft.version;
    session.empleadaId = draft.intendedEmployeeId ?? undefined;
    session.duracionPactadaHoras = draft.durationHours ?? undefined;
    session.duracionIndefinida = draft.openEndedDuration;
    session.presetLocationId = draft.presetLocationId ?? undefined;
    session.locationNameSnapshot = draft.locationName ?? undefined;
    session.locationAddressSnapshot = draft.locationAddress ?? undefined;
    session.locationNotas = draft.locationNotes;
    session.locationLat = draft.locationLat?.toString();
    session.locationLng = draft.locationLng?.toString();
    session.metodoPago = draft.paymentMethod ?? undefined;
    session.tipoAgenda = draft.scheduleType;
    session.fechaProgramada = draft.scheduledAt?.toISOString();
    session.step = draft.currentRequirement ?? undefined;
    session.bookingStatus =
      draft.status === 'SERVICE_CREATED'
        ? 'SERVICE_CREATED'
        : draft.status === 'READY'
          ? 'READY'
          : 'COLLECTING';
    session.bookingServiceId = draft.serviceId ?? undefined;
    session.iaActiva = draft.mode === 'AI_ACTIVE';
    session.humanTakeover = draft.mode === 'HUMAN_ACTIVE';
  }

  async updateBookingDraft(
    bookingSessionId: string,
    actor: Usuarios,
    patch: UpdateBookingDraftDto,
  ) {
    const conversation = await this.getAuthorizedPreServiceConversation(
      bookingSessionId,
      actor,
    );
    const draft = await this.getBookingDraft(bookingSessionId);
    if (patch.intendedEmployeeId) {
      const employee = await this.empleadasRepository.findOne({
        where: { id: patch.intendedEmployeeId },
      });
      if (!employee) throw new NotFoundException('Empleada no encontrada');
      if (
        actor.rol === 'jefe' &&
        employee.jefeId !== actor.id &&
        employee.jefeSecundarioId !== actor.id
      ) {
        throw new ForbiddenException('No puedes asignar esa empleada');
      }
      draft.ownerBossId = employee.jefeId;
      draft.intendedEmployeeId = employee.id;
    }
    Object.assign(draft, {
      ...(patch.durationHours !== undefined && {
        durationHours: patch.durationHours,
      }),
      ...(patch.openEndedDuration !== undefined && {
        openEndedDuration: patch.openEndedDuration,
      }),
      ...(patch.placeType !== undefined && { placeType: patch.placeType }),
      ...(patch.presetLocationId !== undefined && {
        presetLocationId: patch.presetLocationId,
      }),
      ...(patch.locationName !== undefined && {
        locationName: patch.locationName,
      }),
      ...(patch.locationAddress !== undefined && {
        locationAddress: patch.locationAddress,
      }),
      ...(patch.locationNotes !== undefined && {
        locationNotes: patch.locationNotes,
      }),
      ...(patch.locationLat !== undefined && {
        locationLat: patch.locationLat,
      }),
      ...(patch.locationLng !== undefined && {
        locationLng: patch.locationLng,
      }),
      ...(patch.room !== undefined && { room: patch.room }),
      ...(patch.paymentMethod !== undefined && {
        paymentMethod: patch.paymentMethod,
      }),
      ...(patch.scheduleType !== undefined && {
        scheduleType: patch.scheduleType,
      }),
      ...(patch.scheduledAt !== undefined && {
        scheduledAt: new Date(patch.scheduledAt),
      }),
      status:
        draft.intendedEmployeeId &&
        (draft.durationHours || draft.openEndedDuration) &&
        draft.paymentMethod &&
        draft.locationLat != null &&
        draft.locationLng != null
          ? 'READY'
          : 'COLLECTING',
      currentRequirement: !draft.intendedEmployeeId
        ? 'employee'
        : !(draft.durationHours || draft.openEndedDuration)
          ? 'AWAITING_DURATION'
          : draft.locationLat == null || draft.locationLng == null
            ? 'AWAITING_LOCATION'
            : !draft.paymentMethod
              ? 'AWAITING_PAYMENT_METHOD'
              : null,
      mode: 'HUMAN_ACTIVE',
      version: draft.version + 1,
      updatedAt: new Date(),
      lastInteractionAt: new Date(),
    });
    const saved = await this.bookingDraftRepository.save(draft);
    if (patch.intendedEmployeeId) {
      await this.conversationsRepository.update(
        { bookingSessionId, servicioId: IsNull() },
        { intendedEmployeeId: patch.intendedEmployeeId },
      );
    }
    await this.syncDraftToTelegramSessions(saved);
    const employeeForEvent = patch.intendedEmployeeId
      ? await this.empleadasRepository.findOne({
          where: { id: patch.intendedEmployeeId },
        })
      : conversation.intendedEmployee;
    this.emitPreServiceEvent(employeeForEvent, {
      type: 'booking_draft_updated',
      data: this.serializeDraft(saved),
    });
    return this.serializeDraft(saved);
  }

  async acceptBookingDraft(bookingSessionId: string, actor: Usuarios) {
    const draft = await this.getBookingDraft(bookingSessionId);
    const employee = draft.intendedEmployeeId
      ? await this.empleadasRepository.findOne({
          where: { id: draft.intendedEmployeeId },
        })
      : null;
    if (!employee) throw new NotFoundException('Empleada no encontrada');
    if (
      actor.rol === 'jefe' &&
      employee.jefeId !== actor.id &&
      employee.jefeSecundarioId !== actor.id
    ) {
      throw new ForbiddenException('No puedes aceptar esta reserva');
    }
    if (draft.serviceId)
      return { draft: this.serializeDraft(draft), idempotent: true };
    const conversation = await this.getAuthorizedPreServiceConversation(
      bookingSessionId,
      actor,
    );
    if (
      !draft.intendedEmployeeId ||
      (!draft.durationHours && !draft.openEndedDuration) ||
      !draft.paymentMethod ||
      draft.locationLat == null ||
      draft.locationLng == null
    ) {
      throw new BadRequestException('El borrador todavía está incompleto');
    }
    const claimed = await this.bookingDraftRepository
      .createQueryBuilder()
      .update(CustomerBookingSession)
      .set({
        status: 'ACCEPTING',
        version: draft.version + 1,
        updatedAt: new Date(),
      })
      .where('id = :id AND service_id IS NULL AND version = :version', {
        id: draft.id,
        version: draft.version,
      })
      .execute();
    if (!claimed.affected) {
      const current = await this.getBookingDraft(bookingSessionId);
      if (current.serviceId)
        return { draft: this.serializeDraft(current), idempotent: true };
      throw new ConflictException(
        'La reserva está siendo aceptada por otra persona',
      );
    }
    try {
      const preexistingService = await this.servicesRepository.findOne({
        where: { bookingSessionId: draft.id },
      });
      if (preexistingService) {
        const recovered = await this.bookingDraftRepository.save({
          ...draft,
          serviceId: preexistingService.id,
          status: 'SERVICE_CREATED',
          version: draft.version + 2,
          updatedAt: new Date(),
        });
        await this.conversationsRepository.update(
          { bookingSessionId: draft.id, servicioId: IsNull() },
          { servicioId: preexistingService.id },
        );
        return {
          draft: this.serializeDraft(recovered),
          service: preexistingService,
          idempotent: true,
        };
      }
      const service = await this.servicesService.reserveNext({
        clienteId: draft.clientId,
        bookingSessionId: draft.id,
        empleadaId: employee.id,
        jefeId: employee.jefeId ?? actor.id,
        duracionPactadaHoras: draft.openEndedDuration
          ? 1
          : draft.durationHours!,
        duracionIndefinida: draft.openEndedDuration,
        metodoPago: draft.paymentMethod,
        ubicacionClienteLat: draft.locationLat,
        ubicacionClienteLng: draft.locationLng,
        precioBaseHoraPactado: Number(employee.precioBaseHora) || 1200,
        estado: 'pendiente',
        notas: draft.locationNotes || null,
        habitacion: draft.room,
        clienteTelegramId: conversation.cliente?.telegramChatId ?? null,
        comprobantePendiente: draft.paymentMethod === 'transferencia',
        iaActiva: false,
        presetLocationId: draft.presetLocationId,
        locationNameSnapshot: draft.locationName,
        locationAddressSnapshot: draft.locationAddress,
        tipoAgenda: draft.scheduleType,
        fechaProgramada: draft.scheduledAt,
      });
      // Boss acceptance opens the employee acceptance window. The transport
      // remains null and is only activated after the employee accepts.
      await this.servicesService.ofrecerAEmpleada(
        service.id,
        actor.id,
        'chofer',
        undefined,
        draft.room ?? undefined,
      );
      const updated = await this.bookingDraftRepository.save({
        ...draft,
        serviceId: service.id,
        status: 'SERVICE_CREATED',
        version: draft.version + 2,
        updatedAt: new Date(),
      });
      await this.conversationsRepository.update(
        { bookingSessionId: draft.id, servicioId: IsNull() },
        { servicioId: service.id },
      );
      this.emitPreServiceEvent(conversation.intendedEmployee, {
        type: 'booking_service_created',
        data: { bookingSessionId: draft.id, serviceId: service.id },
      });
      return {
        draft: this.serializeDraft(updated),
        service,
        idempotent: false,
      };
    } catch (error) {
      const existingService = await this.servicesRepository.findOne({
        where: { bookingSessionId: draft.id },
      });
      if (existingService) {
        const recovered = await this.bookingDraftRepository.save({
          ...draft,
          serviceId: existingService.id,
          status: 'SERVICE_CREATED',
          version: draft.version + 2,
          updatedAt: new Date(),
        });
        await this.conversationsRepository.update(
          { bookingSessionId: draft.id, servicioId: IsNull() },
          { servicioId: existingService.id },
        );
        return {
          draft: this.serializeDraft(recovered),
          service: existingService,
          idempotent: true,
        };
      }
      await this.bookingDraftRepository.update(
        { id: draft.id, serviceId: IsNull() },
        { status: 'READY', version: draft.version + 1, updatedAt: new Date() },
      );
      throw error;
    }
  }

  private async syncDraftToTelegramSessions(draft: CustomerBookingSession) {
    const payload = {
      bookingDraftVersion: draft.version,
      empleadaId: draft.intendedEmployeeId,
      duracionPactadaHoras: draft.durationHours,
      duracionIndefinida: draft.openEndedDuration,
      presetLocationId: draft.presetLocationId,
      locationNameSnapshot: draft.locationName,
      locationAddressSnapshot: draft.locationAddress,
      locationNotas: draft.locationNotes,
      locationLat: draft.locationLat?.toString(),
      locationLng: draft.locationLng?.toString(),
      room: draft.room,
      metodoPago: draft.paymentMethod,
      tipoAgenda: draft.scheduleType,
      fechaProgramada: draft.scheduledAt?.toISOString(),
      bookingStatus:
        draft.status === 'SERVICE_CREATED'
          ? 'SERVICE_CREATED'
          : draft.status === 'READY'
            ? 'READY'
            : 'COLLECTING',
      bookingServiceId: draft.serviceId,
      iaActiva: draft.mode === 'AI_ACTIVE',
      humanTakeover: draft.mode === 'HUMAN_ACTIVE',
    };
    await this.telegramSessionRepository.query(
      `UPDATE telegram_sessions
          SET data = COALESCE(data, '{}'::jsonb) || $2::jsonb,
              version = version + 1,
              updated_at = now()
        WHERE data->>'bookingSessionId' = $1`,
      [draft.id, JSON.stringify(payload)],
    );
  }

  /**
   * Conversaciones todavia sin servicio, limitadas por la empleada que el
   * cliente eligio en el deep-link del catalogo. El ownership se resuelve con
   * las relaciones persistidas, nunca con ids enviados por el navegador.
   */
  async listPreServiceConversations(actor: Usuarios, requestedLimit = 100) {
    if (actor.rol !== 'admin' && actor.rol !== 'jefe') {
      throw new ForbiddenException('No puedes ver estas conversaciones');
    }

    const limit = Math.min(Math.max(requestedLimit || 100, 1), 200);
    const sessionsQuery = this.conversationsRepository
      .createQueryBuilder('conversation')
      .leftJoin('conversation.intendedEmployee', 'employee')
      .select('conversation.bookingSessionId', 'bookingSessionId')
      .addSelect('MAX(conversation.enviadoAt)', 'lastAt')
      .where('conversation.bookingSessionId IS NOT NULL')
      .andWhere('conversation.servicioId IS NULL');

    if (actor.rol === 'jefe') {
      sessionsQuery
        .andWhere('conversation.intendedEmployeeId IS NOT NULL')
        .andWhere(
          '(employee.jefeId = :actorId OR employee.jefeSecundarioId = :actorId)',
          { actorId: actor.id },
        );
    }

    const sessionRows = await sessionsQuery
      .groupBy('conversation.bookingSessionId')
      .orderBy('MAX(conversation.enviadoAt)', 'DESC')
      .limit(limit)
      .getRawMany<{ bookingSessionId: string; lastAt: Date }>();
    const bookingSessionIds = sessionRows.map((row) => row.bookingSessionId);
    if (!bookingSessionIds.length) return [];

    const messages = await this.conversationsRepository.find({
      where: {
        bookingSessionId: In(bookingSessionIds),
        servicioId: IsNull(),
      },
      relations: { cliente: true, intendedEmployee: true },
      order: { enviadoAt: 'ASC' },
    });
    const sessionEntities = await this.telegramSessionRepository
      .createQueryBuilder('session')
      .where("session.data->>'bookingSessionId' IN (:...bookingSessionIds)", {
        bookingSessionIds,
      })
      .orderBy('session.updatedAt', 'DESC')
      .getMany();
    const sessionDataByBooking = new Map<string, Record<string, unknown>>();
    for (const entity of sessionEntities) {
      const data = (entity.data ?? {}) as Record<string, unknown>;
      const bookingSessionId = this.stringValue(data.bookingSessionId);
      if (bookingSessionId && !sessionDataByBooking.has(bookingSessionId)) {
        sessionDataByBooking.set(bookingSessionId, data);
      }
    }
    const drafts = this.bookingDraftRepository
      ? await this.bookingDraftRepository.findBy({
          id: In(bookingSessionIds),
        })
      : [];
    const draftByBooking = new Map(drafts.map((draft) => [draft.id, draft]));

    const messagesByBooking = new Map<string, ConversacionesTelegram[]>();
    for (const message of messages) {
      if (!message.bookingSessionId) continue;
      const current = messagesByBooking.get(message.bookingSessionId) ?? [];
      current.push(message);
      messagesByBooking.set(message.bookingSessionId, current);
    }

    return bookingSessionIds.flatMap((bookingSessionId) => {
      const history = messagesByBooking.get(bookingSessionId) ?? [];
      const first = history[0];
      const latest = history.at(-1);
      if (!first || !latest) return [];
      const employee = history.find(
        (message) => message.intendedEmployee,
      )?.intendedEmployee;
      const data = sessionDataByBooking.get(bookingSessionId) ?? {};
      const draft = draftByBooking.get(bookingSessionId);
      return [
        {
          conversationId: bookingSessionId,
          bookingSessionId,
          client: {
            id: first.clienteId,
            name: first.cliente?.nombreTelegram ?? null,
            telegramId: first.cliente?.telegramChatId ?? null,
          },
          intendedEmployee: employee
            ? { id: employee.id, name: employee.nombreArtistico }
            : null,
          service: null,
          messages: history,
          mode: latest.iaActiva ? 'AI_ACTIVE' : 'HUMAN_ACTIVE',
          lastMessage: latest.mensaje,
          lastAt: latest.enviadoAt,
          needsReply: latest.emisor === 'cliente',
          createdAt: first.enviadoAt,
          bookingData: draft
            ? this.bookingDataFromDraft(draft)
            : this.bookingData(data),
          bookingDraft: draft ? this.serializeDraft(draft) : null,
        },
      ];
    });
  }

  async findByService(
    serviceId: string,
    actor: Usuarios,
    cursor?: string,
    requestedLimit = 50,
  ) {
    await this.getAuthorizedService(serviceId, actor);
    const limit = Math.min(Math.max(requestedLimit || 50, 1), 100);
    const messages = await this.conversationsRepository.find({
      where: {
        servicioId: serviceId,
        ...(cursor ? { enviadoAt: LessThan(new Date(cursor)) } : {}),
      },
      order: { enviadoAt: 'DESC' },
      take: limit + 1,
    });
    const hasMore = messages.length > limit;
    const page = messages.slice(0, limit).reverse();
    return {
      messages: page,
      nextCursor: hasMore ? page[0]?.enviadoAt.toISOString() : null,
    };
  }

  /**
   * Conversaciones que arrancaron pero nunca llegaron a convertirse en
   * servicio: el registro ya se guarda desde el primer mensaje (enganchado
   * por `bookingSessionId`), pero sin un servicio al que asociarlas quedaban
   * invisibles para cualquier pantalla que solo navegara por servicios.
   *
   * Solo admin: no hay jefe al que atribuirle una conversacion que nunca
   * llego a asignarse a nadie.
   */
  async listUnlinkedSessions(actor: Usuarios, limit = 100) {
    if (actor.rol !== 'admin') {
      throw new ConflictException('Solo un admin puede ver esto');
    }
    const take = Math.min(Math.max(limit || 100, 1), 300);
    const rows = await this.conversationsRepository
      .createQueryBuilder('c')
      .innerJoin('c.cliente', 'cliente')
      .select('c.bookingSessionId', 'bookingSessionId')
      .addSelect('c.clienteId', 'clienteId')
      .addSelect('cliente.nombreTelegram', 'clienteNombre')
      .addSelect('cliente.telegramChatId', 'clienteTelegramId')
      .addSelect('MIN(c.enviadoAt)', 'startedAt')
      .addSelect('MAX(c.enviadoAt)', 'lastAt')
      .addSelect('COUNT(*)', 'messageCount')
      .where('c.bookingSessionId IS NOT NULL')
      .andWhere('c.servicioId IS NULL')
      .groupBy('c.bookingSessionId')
      .addGroupBy('c.clienteId')
      .addGroupBy('cliente.nombreTelegram')
      .addGroupBy('cliente.telegramChatId')
      .orderBy('MAX(c.enviadoAt)', 'DESC')
      .limit(take)
      .getRawMany<{
        bookingSessionId: string;
        clienteId: string;
        clienteNombre: string | null;
        clienteTelegramId: string;
        startedAt: Date;
        lastAt: Date;
        messageCount: string;
      }>();

    return rows.map((r) => ({
      bookingSessionId: r.bookingSessionId,
      clienteId: r.clienteId,
      clienteNombre: r.clienteNombre,
      clienteTelegramId: r.clienteTelegramId,
      startedAt: r.startedAt,
      lastAt: r.lastAt,
      messageCount: Number(r.messageCount),
    }));
  }

  /**
   * CRM Web: Lista todos los clientes con los que el bot ha interactuado recientemente,
   * independientemente de si pertenecen a una bookingSessionId o un servicio.
   */
  async listRecentChats(actor: Usuarios, limit = 50, search?: string) {
    if (actor.rol !== 'admin') {
      throw new ForbiddenException('Solo un admin puede ver este monitor');
    }
    const take = Math.min(Math.max(limit || 50, 1), 300);
    const query = this.conversationsRepository
      .createQueryBuilder('c')
      .innerJoin('c.cliente', 'cliente')
      .select('c.clienteId', 'clienteId')
      .addSelect('cliente.nombreTelegram', 'clienteNombre')
      .addSelect('cliente.telegramChatId', 'clienteTelegramId')
      .addSelect('MAX(c.enviadoAt)', 'lastAt')
      .addSelect('COUNT(*)', 'messageCount')
      .addSelect(
        '(ARRAY_AGG(c.mensaje ORDER BY c.enviado_at DESC))[1]',
        'lastMessage',
      )
      .addSelect(
        '(ARRAY_AGG(c.ia_activa ORDER BY c.enviado_at DESC))[1]',
        'iaActiva',
      )
      .addSelect(
        '(SELECT s.id FROM servicios s WHERE s.cliente_id = c.cliente_id ORDER BY s.created_at DESC LIMIT 1)',
        'serviceId',
      )
      .addSelect(
        '(SELECT s.estado FROM servicios s WHERE s.cliente_id = c.cliente_id ORDER BY s.created_at DESC LIMIT 1)',
        'serviceState',
      )
      .addSelect(
        '(SELECT e.nombre_artistico FROM servicios s LEFT JOIN empleadas e ON e.id = s.empleada_id WHERE s.cliente_id = c.cliente_id ORDER BY s.created_at DESC LIMIT 1)',
        'employeeName',
      )
      .groupBy('c.clienteId')
      .addGroupBy('cliente.nombreTelegram')
      .addGroupBy('cliente.telegramChatId')
      .orderBy('MAX(c.enviadoAt)', 'DESC')
      .limit(take);
    const term = search?.trim().toLowerCase();
    if (term) {
      query.andWhere(
        "(LOWER(COALESCE(cliente.nombre_telegram, '')) LIKE :search OR cliente.telegram_chat_id LIKE :search)",
        { search: `%${term}%` },
      );
    }
    const rows = await query.getRawMany<{
      clienteId: string;
      clienteNombre: string | null;
      clienteTelegramId: string;
      lastAt: Date;
      messageCount: string;
      lastMessage: string;
      iaActiva: boolean;
      serviceId: string | null;
      serviceState: string | null;
      employeeName: string | null;
    }>();

    return rows.map((r) => ({
      clienteId: r.clienteId,
      clienteNombre: r.clienteNombre,
      clienteTelegramId: r.clienteTelegramId,
      lastAt: r.lastAt,
      messageCount: Number(r.messageCount),
      lastMessage: r.lastMessage,
      mode: r.iaActiva ? ('AI_ACTIVE' as const) : ('HUMAN_ACTIVE' as const),
      serviceId: r.serviceId,
      serviceState: r.serviceState,
      employeeName: r.employeeName,
    }));
  }

  /** CRM Web: Historial completo de un cliente, sin importar sesión o servicio. */
  async findHistoryByClient(clientId: string, actor: Usuarios) {
    if (actor.rol !== 'admin') {
      throw new ForbiddenException('Solo un admin puede ver este monitor');
    }
    return this.conversationsRepository.find({
      where: { cliente: { id: clientId } },
      order: { enviadoAt: 'ASC' },
    });
  }

  /** Historial completo de una conversacion que nunca se convirtio en servicio. */
  async findByBookingSession(bookingSessionId: string, actor: Usuarios) {
    await this.getAuthorizedPreServiceConversation(bookingSessionId, actor);
    return this.conversationsRepository.find({
      where: { bookingSessionId },
      order: { enviadoAt: 'ASC' },
    });
  }

  async sendBossMessage(serviceId: string, actor: Usuarios, raw: string) {
    const service = await this.getAuthorizedService(serviceId, actor);
    const message = raw.trim();
    if (!message) throw new ConflictException('El mensaje está vacío');
    const clientChatId =
      service.clienteTelegramId || service.cliente?.telegramChatId;
    if (!clientChatId) {
      throw new ConflictException('El cliente no tiene Telegram vinculado');
    }

    await this.bot.telegram.sendMessage(clientChatId, message);
    if (service.jefe?.grupoTelegramId && service.telegramThreadId) {
      await this.bot.telegram.sendMessage(
        service.jefe.grupoTelegramId,
        `Panel web: ${message}`,
        { message_thread_id: Number(service.telegramThreadId) },
      );
    }
    return this.record(service, 'jefe', message);
  }

  async sendAdminMessage(
    serviceId: string,
    actor: Usuarios,
    raw: string,
    asIdentity: 'empleada' | 'jefe' | 'ia' = 'jefe',
  ) {
    const service = await this.getAuthorizedService(serviceId, actor);
    const message = raw.trim();
    if (!message) throw new ConflictException('El mensaje está vacío');
    const clientChatId =
      service.clienteTelegramId || service.cliente?.telegramChatId;
    if (!clientChatId) {
      throw new ConflictException('El cliente no tiene Telegram vinculado');
    }

    await this.bot.telegram.sendMessage(clientChatId, message);
    if (service.jefe?.grupoTelegramId && service.telegramThreadId) {
      await this.bot.telegram.sendMessage(
        service.jefe.grupoTelegramId,
        `[Admin como ${asIdentity}]: ${message}`,
        { message_thread_id: Number(service.telegramThreadId) },
      );
    }
    return this.record(service, asIdentity, message);
  }

  async sendAdminMessageToSession(
    bookingSessionId: string,
    actor: Usuarios,
    raw: string,
    asIdentity: 'ia' | 'jefe' = 'jefe',
  ) {
    if (actor.rol !== 'admin' && actor.rol !== 'jefe') {
      throw new ForbiddenException('No puedes responder esta conversación');
    }
    const message = raw.trim();
    if (!message) throw new ConflictException('El mensaje está vacío');

    // Buscar al cliente asociado a esta sesión
    const conversation = await this.getAuthorizedPreServiceConversation(
      bookingSessionId,
      actor,
    );

    if (!conversation || !conversation.cliente) {
      throw new NotFoundException(
        'Sesión no encontrada o sin cliente asociado',
      );
    }

    if (conversation.iaActiva) {
      throw new ConflictException(
        'Toma el control de la conversación antes de responder',
      );
    }
    const clientChatId = conversation.cliente.telegramChatId;
    if (!clientChatId) {
      throw new ConflictException('El cliente no tiene Telegram vinculado');
    }

    await this.bot.telegram.sendMessage(clientChatId, message);

    // Guardar el mensaje en el historial
    const saved = await this.conversationsRepository.save(
      this.conversationsRepository.create({
        clienteId: conversation.clienteId,
        servicioId: null,
        bookingSessionId,
        intendedEmployeeId: conversation.intendedEmployeeId,
        emisor: asIdentity,
        mensaje: message,
        iaActiva: false,
      }),
    );
    this.emitPreServiceEvent(conversation.intendedEmployee, {
      type: 'chat_message',
      data: saved,
    });
    return saved;
  }

  async toggleAiByBookingSession(
    bookingSessionId: string,
    actor: Usuarios,
    iaActiva: boolean,
  ) {
    const conversation = await this.getAuthorizedPreServiceConversation(
      bookingSessionId,
      actor,
    );
    const updatedSessions: Array<{ key: string }> =
      await this.telegramSessionRepository.query(
        `UPDATE telegram_sessions
            SET data = jsonb_set(
                         jsonb_set(COALESCE(data, '{}'::jsonb),
                                   '{iaActiva}', to_jsonb($2::boolean), true),
                         '{humanTakeover}', to_jsonb($3::boolean), true
                       ),
                version = version + 1,
                updated_at = now()
          WHERE data->>'bookingSessionId' = $1
          RETURNING key`,
        [bookingSessionId, iaActiva, !iaActiva],
      );
    if (!updatedSessions.length) {
      throw new ConflictException(
        'La sesión de Telegram ya no está disponible para cambiar el control',
      );
    }

    const draft = this.bookingDraftRepository
      ? await this.bookingDraftRepository.findOneBy({ id: bookingSessionId })
      : null;
    if (draft) {
      draft.mode = iaActiva ? 'AI_ACTIVE' : 'HUMAN_ACTIVE';
      if (!iaActiva) draft.status = 'HUMAN_ACTIVE';
      if (iaActiva && draft.status === 'HUMAN_ACTIVE') {
        draft.status = draft.currentRequirement ? 'COLLECTING' : 'READY';
      }
      draft.version += 1;
      draft.updatedAt = new Date();
      await this.bookingDraftRepository.save(draft);
    }

    await this.conversationsRepository.update(
      { bookingSessionId },
      { iaActiva },
    );
    const saved = await this.conversationsRepository.save(
      this.conversationsRepository.create({
        clienteId: conversation.clienteId,
        servicioId: null,
        bookingSessionId,
        intendedEmployeeId: conversation.intendedEmployeeId,
        emisor: 'sistema',
        mensaje: iaActiva
          ? 'Conversación devuelta a la IA por el jefe.'
          : 'Conversación tomada por el jefe.',
        iaActiva,
      }),
    );
    this.emitPreServiceEvent(conversation.intendedEmployee, {
      type: 'conversation_mode_changed',
      data: {
        bookingSessionId,
        clientId: conversation.clienteId,
        mode: iaActiva ? 'AI_ACTIVE' : 'HUMAN_ACTIVE',
      },
    });
    this.emitPreServiceEvent(conversation.intendedEmployee, {
      type: 'chat_message',
      data: saved,
    });
    return { ok: true, bookingSessionId, iaActiva };
  }

  async pauseAi(serviceId: string, actor: Usuarios) {
    const service = await this.getAuthorizedService(serviceId, actor);
    service.iaActiva = false;
    const updated = await this.servicesRepository.save(service);
    this.realtimeEvents.emitToBosses(
      [
        service.jefeId,
        service.empleada?.jefeId,
        service.empleada?.jefeSecundarioId,
      ],
      {
        type: 'service_ai_paused',
        data: { serviceId, iaActiva: false },
      },
    );
    return { ok: true, serviceId, iaActiva: false };
  }

  async resumeAi(serviceId: string, actor: Usuarios) {
    const service = await this.getAuthorizedService(serviceId, actor);
    service.iaActiva = true;
    const updated = await this.servicesRepository.save(service);
    this.realtimeEvents.emitToBosses(
      [
        service.jefeId,
        service.empleada?.jefeId,
        service.empleada?.jefeSecundarioId,
      ],
      {
        type: 'service_ai_resumed',
        data: { serviceId, iaActiva: true },
      },
    );
    return { ok: true, serviceId, iaActiva: true };
  }

  async record(
    service: Servicios,
    sender: 'ia' | 'jefe' | 'cliente' | 'empleada',
    message: string,
  ) {
    // Sin cliente identificado no hay conversacion a la que pertenezca: pasa
    // en los servicios registrados a posteriori, que ademas no tienen chat.
    if (!service.clienteId) return null;
    const saved = await this.conversationsRepository.save(
      this.conversationsRepository.create({
        clienteId: service.clienteId,
        servicioId: service.id,
        intendedEmployeeId: service.empleadaId,
        emisor: sender as any,
        mensaje: message,
        iaActiva: service.iaActiva,
      }),
    );
    this.realtimeEvents.emitToBosses(
      [
        service.jefeId,
        service.empleada?.jefeId,
        service.empleada?.jefeSecundarioId,
      ],
      {
        type: 'chat_message',
        data: saved,
      },
    );
    return saved;
  }

  private async getAuthorizedService(serviceId: string, actor: Usuarios) {
    const service = await this.servicesRepository.findOne({
      where: { id: serviceId },
      relations: { cliente: true, empleada: true, jefe: true },
    });
    if (!service) throw new NotFoundException('Servicio no encontrado');
    if (
      actor.rol !== 'admin' &&
      (actor.rol !== 'jefe' ||
        (service.jefeId !== actor.id &&
          service.empleada?.jefeId !== actor.id &&
          service.empleada?.jefeSecundarioId !== actor.id))
    ) {
      throw new ConflictException('No puedes acceder a esta conversación');
    }
    return service;
  }

  private async getAuthorizedPreServiceConversation(
    bookingSessionId: string,
    actor: Usuarios,
  ): Promise<ConversacionesTelegram> {
    const conversation = await this.conversationsRepository.findOne({
      where: { bookingSessionId, servicioId: IsNull() },
      relations: { cliente: true, intendedEmployee: true },
      order: { enviadoAt: 'DESC' },
    });
    if (!conversation) {
      throw new NotFoundException('Conversación pre-servicio no encontrada');
    }
    if (actor.rol === 'admin') return conversation;
    const employee = conversation.intendedEmployee;
    if (
      actor.rol !== 'jefe' ||
      !employee ||
      (employee.jefeId !== actor.id && employee.jefeSecundarioId !== actor.id)
    ) {
      throw new ForbiddenException(
        'No puedes acceder a esta conversación pre-servicio',
      );
    }
    return conversation;
  }

  private emitPreServiceEvent(
    employee: Empleadas | null,
    event: Record<string, unknown>,
  ): void {
    if (!employee) return;
    const bossIds = [employee.jefeId, employee.jefeSecundarioId].filter(
      (id): id is string => Boolean(id),
    );
    if (!bossIds.length) return;
    this.realtimeEvents.emitToBosses(bossIds, event);
  }

  private bookingData(data: Record<string, unknown>): PreServiceBookingData {
    return {
      durationHours: this.numberValue(data.duracionPactadaHoras),
      openEndedDuration: data.duracionIndefinida === true,
      paymentMethod: this.stringValue(data.metodoPago),
      locationName: this.stringValue(data.locationNameSnapshot),
      locationAddress: this.stringValue(data.locationAddressSnapshot),
      locationNotes: this.stringValue(data.locationNotas),
      locationLat: this.finiteNumberValue(data.locationLat),
      locationLng: this.finiteNumberValue(data.locationLng),
      placeType: data.presetLocationId ? 'preset' : 'external',
      room: this.stringValue(data.room),
      scheduleType: this.stringValue(data.tipoAgenda),
      scheduledAt: this.stringValue(data.fechaProgramada),
      currentRequirement: this.stringValue(data.step),
      status: this.stringValue(data.bookingStatus) ?? 'COLLECTING',
      version: this.numberValue(data.bookingDraftVersion) ?? 0,
    };
  }

  private bookingDataFromDraft(
    draft: CustomerBookingSession,
  ): PreServiceBookingData {
    return {
      durationHours: draft.durationHours,
      openEndedDuration: draft.openEndedDuration,
      paymentMethod: draft.paymentMethod,
      locationName: draft.locationName,
      locationAddress: draft.locationAddress,
      locationNotes: draft.locationNotes,
      locationLat: draft.locationLat,
      locationLng: draft.locationLng,
      placeType: draft.placeType,
      room: draft.room,
      scheduleType: draft.scheduleType,
      scheduledAt: draft.scheduledAt?.toISOString() ?? null,
      currentRequirement: draft.currentRequirement,
      status: draft.status,
      version: draft.version,
    };
  }

  private serializeDraft(draft: CustomerBookingSession) {
    return {
      id: draft.id,
      clientId: draft.clientId,
      intendedEmployeeId: draft.intendedEmployeeId,
      ownerBossId: draft.ownerBossId,
      status: draft.status,
      mode: draft.mode,
      serviceId: draft.serviceId,
      version: draft.version,
      bookingData: this.bookingDataFromDraft(draft),
      room: draft.room,
      metadata: draft.metadata,
      updatedAt: draft.updatedAt,
    };
  }

  private draftStatus(
    session: Record<string, unknown>,
  ): CustomerBookingSession['status'] {
    if (
      session.bookingStatus === 'SERVICE_CREATED' ||
      session.bookingServiceId
    ) {
      return 'SERVICE_CREATED';
    }
    if (session.bookingStatus === 'READY') return 'READY';
    return 'COLLECTING';
  }

  private stringValue(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private numberValue(value: unknown): number | null {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
  }

  private finiteNumberValue(value: unknown): number | null {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) ? number : null;
  }

  private paymentValue(
    value: unknown,
  ): CustomerBookingSession['paymentMethod'] {
    return value === 'efectivo' ||
      value === 'tarjeta' ||
      value === 'transferencia' ||
      value === 'mixto'
      ? value
      : null;
  }

  private dateValue(value: unknown): Date | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  async sendAdminMessageByClient(
    clientId: string,
    actor: Usuarios,
    raw: string,
    asIdentity: 'ia' | 'jefe' = 'jefe',
  ) {
    if (actor.rol !== 'admin') {
      throw new ForbiddenException('Solo un admin puede usar este monitor');
    }
    const message = raw.trim();
    if (!message) throw new ConflictException('El mensaje está vacío');

    const cliente = await this.clientesRepository.findOne({
      where: { id: clientId },
    });
    if (!cliente || !cliente.telegramChatId) {
      throw new NotFoundException(
        'Cliente no encontrado o sin Telegram vinculado',
      );
    }

    const latest = await this.conversationsRepository.findOne({
      where: { clienteId: clientId },
      relations: { intendedEmployee: true },
      order: { enviadoAt: 'DESC' },
    });
    if (!latest || latest.iaActiva) {
      throw new ConflictException(
        'Toma el control de la conversación antes de responder',
      );
    }

    await this.bot.telegram.sendMessage(cliente.telegramChatId, message);

    // Guardar el mensaje en el historial
    const saved = await this.conversationsRepository.save(
      this.conversationsRepository.create({
        clienteId: clientId,
        servicioId: latest.servicioId,
        bookingSessionId: latest.bookingSessionId,
        intendedEmployeeId: latest.intendedEmployeeId,
        emisor: asIdentity,
        mensaje: message,
        iaActiva: false,
      }),
    );
    this.emitPreServiceEvent(latest.intendedEmployee, {
      type: 'chat_message',
      data: saved,
    });
    return saved;
  }

  async toggleAiByClient(clientId: string, actor: Usuarios, iaActiva: boolean) {
    if (actor.rol !== 'admin') {
      throw new ForbiddenException('Solo un admin puede usar este monitor');
    }

    const cliente = await this.clientesRepository.findOne({
      where: { id: clientId },
    });
    if (!cliente || !cliente.telegramChatId) {
      throw new NotFoundException(
        'Cliente no encontrado o sin Telegram vinculado',
      );
    }

    // Actualizamos los servicios activos de este cliente
    const activeServices = await this.servicesRepository.find({
      where: {
        clienteId: clientId,
        estado: In(['pendiente', 'agendado', 'en_curso']),
      },
    });

    for (const service of activeServices) {
      service.iaActiva = iaActiva;
      await this.servicesRepository.save(service);

      this.realtimeEvents.emitToBosses(
        [
          service.jefeId,
          service.empleada?.jefeId,
          service.empleada?.jefeSecundarioId,
        ],
        {
          type: iaActiva ? 'service_ai_resumed' : 'service_ai_paused',
          data: { serviceId: service.id, iaActiva },
        },
      );
    }

    // Buscamos la sesión de telegraf para actualizarla si existe
    // Hacemos una consulta burda pero efectiva porque hay pocas sesiones
    const sessions = await this.telegramSessionRepository.find();
    const clientSessions = sessions.filter((session) => {
      const key = parseSessionKey(session.key);
      return (
        key?.fromId === cliente.telegramChatId ||
        key?.chatId === cliente.telegramChatId
      );
    });

    for (const clientSession of clientSessions) {
      const data = clientSession.data || {};
      data.iaActiva = iaActiva;
      data.humanTakeover = !iaActiva;
      clientSession.data = data;
      await this.telegramSessionRepository.save(clientSession);
    }

    const latest = await this.conversationsRepository.findOne({
      where: { clienteId: clientId },
      relations: { intendedEmployee: true },
      order: { enviadoAt: 'DESC' },
    });

    // Registrar en el historial para que el UI se entere y quede bitácora
    await this.conversationsRepository.save(
      this.conversationsRepository.create({
        clienteId: clientId,
        servicioId: latest?.servicioId ?? null,
        bookingSessionId: latest?.bookingSessionId ?? null,
        intendedEmployeeId: latest?.intendedEmployeeId ?? null,
        emisor: 'sistema',
        mensaje: iaActiva
          ? 'Bot reanudado por el administrador.'
          : 'Bot pausado por el administrador.',
        iaActiva,
      }),
    );

    this.emitPreServiceEvent(latest?.intendedEmployee ?? null, {
      type: 'conversation_mode_changed',
      data: {
        clientId,
        mode: iaActiva ? 'AI_ACTIVE' : 'HUMAN_ACTIVE',
      },
    });

    return { ok: true, iaActiva, clientId };
  }
}
