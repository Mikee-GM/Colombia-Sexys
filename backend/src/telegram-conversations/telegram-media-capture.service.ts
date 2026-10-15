import { Injectable, Logger, Module } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Context, MiddlewareFn } from 'telegraf';
import { In, Repository } from 'typeorm';
import { Clientes } from '../clients/entities/client.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { RealtimeEventsService } from '../realtime/realtime.service';
import { Servicios } from '../services/entities/service.entity';
import { Usuarios } from '../users/entities/user.entity';
import { CustomerBookingSession } from './entities/customer-booking-session.entity';
import { ConversacionesTelegram } from './entities/telegram-conversation.entity';
import { extractConversationAttachment } from './telegram-conversation-attachment';

type MediaContext = Context & { session?: Record<string, unknown> };
type Scope = {
  bookingSessionId: string | null;
  intendedEmployeeId: string | null;
};

function readScope(ctx: MediaContext): Scope {
  return {
    bookingSessionId:
      typeof ctx.session?.bookingSessionId === 'string'
        ? ctx.session.bookingSessionId
        : null,
    intendedEmployeeId:
      typeof ctx.session?.empleadaId === 'string'
        ? ctx.session.empleadaId
        : null,
  };
}

/** Incoming history only: no downloads, replies or session/business mutations. */
@Injectable()
export class TelegramMediaCaptureService {
  private readonly logger = new Logger(TelegramMediaCaptureService.name);

  constructor(
    @InjectRepository(ConversacionesTelegram)
    private readonly conversations: Repository<ConversacionesTelegram>,
    @InjectRepository(Clientes) private readonly clients: Repository<Clientes>,
    @InjectRepository(Usuarios) private readonly users: Repository<Usuarios>,
    @InjectRepository(Servicios)
    private readonly services: Repository<Servicios>,
    @InjectRepository(Empleadas)
    private readonly employees: Repository<Empleadas>,
    @InjectRepository(CustomerBookingSession)
    private readonly drafts: Repository<CustomerBookingSession>,
    private readonly realtime: RealtimeEventsService,
  ) {}

  middleware(): MiddlewareFn<MediaContext> {
    return async (ctx, next) => {
      const message = ctx.message ?? ctx.editedMessage;
      if (
        ctx.chat?.type !== 'private' ||
        !ctx.from ||
        !message ||
        !extractConversationAttachment(message, 'pending')
      ) {
        return next();
      }
      const before = readScope(ctx);
      try {
        await next();
      } finally {
        try {
          await this.capture(ctx, before);
        } catch {
          // Do not log the update, private image identifier or client content.
          this.logger.warn(
            'No fue posible registrar el adjunto en el historial',
          );
        }
      }
    };
  }

  private async capture(ctx: MediaContext, before: Scope): Promise<void> {
    const message = ctx.message ?? ctx.editedMessage;
    if (!message || !ctx.chat || !ctx.from) return;
    const telegramChatId = String(ctx.chat.id);
    const telegramMessageId = String(message.message_id);
    if (
      await this.users.findOne({
        where: { telegramChatId: String(ctx.from.id) },
        select: { id: true },
      })
    ) {
      return;
    }
    const client = await this.clients.findOne({
      where: { telegramChatId },
      select: { id: true },
    });
    if (!client) return;

    const existing = await this.conversations.findOne({
      where: {
        clienteId: client.id,
        telegramChatId,
        telegramMessageId,
        emisor: 'cliente',
      },
      relations: { servicio: { empleada: true }, intendedEmployee: true },
      order: { enviadoAt: 'ASC', id: 'ASC' },
    });
    const id = existing?.id ?? randomUUID();
    const captured = extractConversationAttachment(message, id);
    if (!captured) return;

    let service = existing?.servicio ?? null;
    let employee = existing?.intendedEmployee ?? null;
    let bookingSessionId =
      existing?.bookingSessionId ??
      before.bookingSessionId ??
      readScope(ctx).bookingSessionId;
    const employeeId =
      existing?.intendedEmployeeId ??
      before.intendedEmployeeId ??
      readScope(ctx).intendedEmployeeId;
    if (!existing) {
      const draft = bookingSessionId
        ? await this.drafts.findOne({
            where: { id: bookingSessionId, clientId: client.id },
          })
        : null;
      if (draft?.serviceId) {
        service = await this.services.findOne({
          where: { id: draft.serviceId, clienteId: client.id },
          relations: { empleada: true },
        });
      } else if (!draft && !bookingSessionId) {
        const active = await this.services.find({
          where: {
            clienteId: client.id,
            estado: In(['pendiente', 'en_curso', 'agendado']),
          },
          relations: { empleada: true },
          take: 2,
        });
        // No assignment to an arbitrary operation if more than one is active.
        if (active.length === 1) service = active[0];
      }
      const resolvedEmployeeId =
        service?.empleadaId ?? draft?.intendedEmployeeId ?? employeeId;
      employee =
        service?.empleada ??
        (resolvedEmployeeId
          ? await this.employees.findOne({ where: { id: resolvedEmployeeId } })
          : null);
      if (!service && (!bookingSessionId || !employee)) return;
      bookingSessionId = draft?.id ?? bookingSessionId;
    }

    const bossIds = [
      service?.jefeId,
      service?.empleada?.jefeId,
      service?.empleada?.jefeSecundarioId,
      employee?.jefeId,
      employee?.jefeSecundarioId,
    ].filter((id): id is string => Boolean(id));
    if (existing) {
      await this.conversations.update(id, {
        attachment: captured.attachment,
        photoFileId: captured.photoFileId,
      });
      this.realtime.emitToBosses(bossIds, {
        type: 'chat_message_updated',
        data: {
          id,
          clienteId: client.id,
          servicioId: existing.servicioId,
          bookingSessionId: existing.bookingSessionId,
        },
      });
      return;
    }

    const saved = await this.conversations.save(
      this.conversations.create({
        id,
        clienteId: client.id,
        servicioId: service?.id ?? null,
        bookingSessionId,
        intendedEmployeeId: employee?.id ?? service?.empleadaId ?? null,
        emisor: 'cliente',
        mensaje: captured.text,
        iaActiva: service
          ? service.iaActiva
          : ctx.session?.iaActiva !== false && !ctx.session?.humanTakeover,
        enviadoAt: new Date(message.date * 1000),
        telegramChatId,
        telegramMessageId,
        attachment: captured.attachment,
        photoFileId: captured.photoFileId,
      }),
    );
    // save() includes select:false fields in its return value: never emit it raw.
    const publicMessage = { ...saved } as Record<string, unknown>;
    delete publicMessage.photoFileId;
    this.realtime.emitToBosses(bossIds, {
      type: 'chat_message',
      data: publicMessage,
    });
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConversacionesTelegram,
      Clientes,
      Usuarios,
      Servicios,
      Empleadas,
      CustomerBookingSession,
    ]),
  ],
  providers: [TelegramMediaCaptureService],
  exports: [TelegramMediaCaptureService],
})
export class TelegramMediaCaptureModule {}
