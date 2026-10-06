import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
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

type PreServiceBookingData = {
  durationHours: number | null;
  openEndedDuration: boolean;
  paymentMethod: string | null;
  locationName: string | null;
  locationAddress: string | null;
  locationNotes: string | null;
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
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

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
          bookingData: this.bookingData(data),
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
    };
  }

  private stringValue(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private numberValue(value: unknown): number | null {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) && number > 0 ? number : null;
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
