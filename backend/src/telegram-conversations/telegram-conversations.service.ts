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

@Injectable()
export class TelegramConversationsService {
  constructor(
    @InjectRepository(ConversacionesTelegram)
    private readonly conversationsRepository: Repository<ConversacionesTelegram>,
    @InjectRepository(Servicios)
    private readonly servicesRepository: Repository<Servicios>,
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

  async record(
    service: Servicios,
    sender: 'ia' | 'jefe' | 'cliente',
    message: string,
  ) {
    const saved = await this.conversationsRepository.save(
      this.conversationsRepository.create({
        clienteId: service.clienteId,
        servicioId: service.id,
        emisor: sender,
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
}
