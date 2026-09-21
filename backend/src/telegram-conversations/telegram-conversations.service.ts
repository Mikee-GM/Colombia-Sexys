import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectBot } from 'nestjs-telegraf';
import { LessThan, Repository } from 'typeorm';
import { Context, Telegraf } from 'telegraf';
import { ConversacionesTelegram } from './entities/telegram-conversation.entity';
import { Servicios } from '../services/entities/service.entity';
import { Usuarios } from '../users/entities/user.entity';
import { RealtimeEventsService } from '../realtime/realtime.service';
import { TelegramSession } from '../telegram/entities/telegram-session.entity';
import { Clientes } from '../clients/entities/client.entity';

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
  async listRecentChats(actor: Usuarios, limit = 50) {
    if (actor.rol !== 'admin') {
      throw new ConflictException('Solo un admin puede ver esto');
    }
    const take = Math.min(Math.max(limit || 50, 1), 300);
    const rows = await this.conversationsRepository
      .createQueryBuilder('c')
      .innerJoin('c.cliente', 'cliente')
      .select('c.clienteId', 'clienteId')
      .addSelect('cliente.nombreTelegram', 'clienteNombre')
      .addSelect('cliente.telegramChatId', 'clienteTelegramId')
      .addSelect('MAX(c.enviadoAt)', 'lastAt')
      .addSelect('COUNT(*)', 'messageCount')
      .groupBy('c.clienteId')
      .addGroupBy('cliente.nombreTelegram')
      .addGroupBy('cliente.telegramChatId')
      .orderBy('MAX(c.enviadoAt)', 'DESC')
      .limit(take)
      .getRawMany<{
        clienteId: string;
        clienteNombre: string | null;
        clienteTelegramId: string;
        lastAt: Date;
        messageCount: string;
      }>();

    return rows.map((r) => ({
      clienteId: r.clienteId,
      clienteNombre: r.clienteNombre,
      clienteTelegramId: r.clienteTelegramId,
      lastAt: r.lastAt,
      messageCount: Number(r.messageCount),
    }));
  }

  /** CRM Web: Historial completo de un cliente, sin importar sesión o servicio. */
  async findHistoryByClient(clientId: string, actor: Usuarios) {
    if (actor.rol !== 'admin') {
      throw new ConflictException('Solo un admin puede ver esto');
    }
    return this.conversationsRepository.find({
      where: { cliente: { id: clientId } },
      order: { enviadoAt: 'ASC' },
      take: 200, // Limitamos para no traer toda la historia si es muy larga
    });
  }

  /** Historial completo de una conversacion que nunca se convirtio en servicio. */
  async findByBookingSession(bookingSessionId: string, actor: Usuarios) {
    if (actor.rol !== 'admin') {
      throw new ConflictException('Solo un admin puede ver esto');
    }
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
    if (actor.rol !== 'admin') {
      throw new ConflictException('Solo un admin puede ver esto');
    }
    const message = raw.trim();
    if (!message) throw new ConflictException('El mensaje está vacío');

    // Buscar al cliente asociado a esta sesión
    const conversation = await this.conversationsRepository.findOne({
      where: { bookingSessionId },
      relations: { cliente: true },
      order: { enviadoAt: 'ASC' },
    });

    if (!conversation || !conversation.cliente) {
      throw new NotFoundException(
        'Sesión no encontrada o sin cliente asociado',
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
        emisor: asIdentity,
        mensaje: message,
        iaActiva: conversation.iaActiva,
      }),
    );
    return saved;
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
  async sendAdminMessageByClient(
    clientId: string,
    actor: Usuarios,
    raw: string,
    asIdentity: 'ia' | 'jefe' = 'jefe',
  ) {
    if (actor.rol !== 'admin') {
      throw new ConflictException('Solo un admin puede ver esto');
    }
    const message = raw.trim();
    if (!message) throw new ConflictException('El mensaje está vacío');

    const cliente = await this.clientesRepository.findOne({ where: { id: clientId } });
    if (!cliente || !cliente.telegramChatId) {
      throw new NotFoundException('Cliente no encontrado o sin Telegram vinculado');
    }

    await this.bot.telegram.sendMessage(cliente.telegramChatId, message);

    // Guardar el mensaje en el historial
    const saved = await this.conversationsRepository.save(
      this.conversationsRepository.create({
        clienteId: clientId,
        servicioId: null,
        bookingSessionId: null, // Lo dejamos nulo ya que es un mensaje global al cliente
        emisor: asIdentity,
        mensaje: message,
        iaActiva: true, // asume true a menos que busquemos la sesion
      }),
    );
    return saved;
  }

  async toggleAiByClient(clientId: string, actor: Usuarios, iaActiva: boolean) {
    if (actor.rol !== 'admin') {
      throw new ConflictException('Solo un admin puede ver esto');
    }

    const cliente = await this.clientesRepository.findOne({ where: { id: clientId } });
    if (!cliente || !cliente.telegramChatId) {
      throw new NotFoundException('Cliente no encontrado o sin Telegram vinculado');
    }

    // Actualizamos los servicios activos de este cliente
    const activeServices = await this.servicesRepository.find({
      where: {
        clienteId: clientId,
        estado: 'en_curso',
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
    const clientSession = sessions.find(s => s.key.includes(`:${cliente.telegramChatId}`));
    
    if (clientSession) {
      const data = clientSession.data || {};
      data.iaActiva = iaActiva;
      data.humanTakeover = !iaActiva;
      clientSession.data = data;
      await this.telegramSessionRepository.save(clientSession);
    }

    return { ok: true, iaActiva, clientId };
  }
}
