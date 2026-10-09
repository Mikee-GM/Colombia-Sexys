import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Context, Telegraf } from 'telegraf';
import { DataSource, In, LessThanOrEqual, Repository } from 'typeorm';
import { describeError } from '../common/errors/error-message';
import { ConversacionesTelegram } from './entities/telegram-conversation.entity';

const DELETE_BATCH_SIZE = 50;
const DELETE_INTERVAL_MS = 60_000;
const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
const LOCK_NAME = 'telegram_message_deletion_scheduler';

@Injectable()
export class TelegramMessageDeletionScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TelegramMessageDeletionScheduler.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly dataSource: DataSource,
    @InjectBot() private readonly bot: Telegraf<Context>,
  ) {}

  onModuleInit(): void {
    void this.runOnce().catch((error) =>
      this.logger.warn(
        `No se pudo ejecutar la limpieza inicial de Telegram: ${describeError(error)}`,
      ),
    );
    this.timer = setInterval(() => {
      void this.runOnce().catch((error) =>
        this.logger.warn(
          `No se pudo ejecutar la limpieza programada de Telegram: ${describeError(error)}`,
        ),
      );
    }, DELETE_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(now = new Date()): Promise<number> {
    const runner = this.dataSource.createQueryRunner();
    await runner.connect();
    let locked = false;

    try {
      const [lockResult] = (await runner.query(
        `SELECT pg_try_advisory_lock(hashtext($1)) AS locked`,
        [LOCK_NAME],
      )) as Array<{ locked: boolean }>;
      locked = lockResult?.locked === true;
      if (!locked) return 0;

      const conversations = runner.manager.getRepository(
        ConversacionesTelegram,
      );
      // Incluye mensajes que se hayan persistido después del cierre (por
      // ejemplo, un comprobante de un servicio de duración abierta). La unión
      // conserva el alcance exacto por servicio o bookingSession y nunca por
      // chat completo.
      await runner.query(`
        UPDATE "conversaciones_telegram" conversation
        SET "delete_at" = COALESCE(service."hora_fin_servicio", service."updated_at") + interval '24 hours',
            "delete_status" = 'PENDING'
        FROM "servicios" service
        WHERE service."estado" = 'finalizado'
          AND conversation."telegram_message_id" IS NOT NULL
          AND conversation."telegram_chat_id" IS NOT NULL
          AND conversation."delete_status" IS NULL
          AND (
            conversation."servicio_id" = service."id"
            OR (
              conversation."servicio_id" IS NULL
              AND conversation."booking_session_id" IS NOT NULL
              AND conversation."booking_session_id" = service."booking_session_id"
            )
          )
      `);
      const due = await conversations.find({
        where: {
          deleteStatus: In(['PENDING', 'FAILED_RETRYABLE']),
          deleteAt: LessThanOrEqual(now),
        },
        order: { deleteAt: 'ASC' },
        take: DELETE_BATCH_SIZE,
      });
      for (const message of due) {
        await this.deleteOne(conversations, message, now);
      }
      return due.length;
    } finally {
      if (locked) {
        await runner
          .query(`SELECT pg_advisory_unlock(hashtext($1))`, [LOCK_NAME])
          .catch((error) =>
            this.logger.warn(
              `No se pudo liberar el lock de limpieza de Telegram: ${describeError(error)}`,
            ),
          );
      }
      await runner
        .release()
        .catch((error) =>
          this.logger.warn(
            `No se pudo liberar la conexión de limpieza de Telegram: ${describeError(error)}`,
          ),
        );
    }
  }

  private async deleteOne(
    conversations: Repository<ConversacionesTelegram>,
    message: ConversacionesTelegram,
    now: Date,
  ): Promise<void> {
    const deleteAt = message.deleteAt?.getTime();
    if (!deleteAt) {
      await this.mark(
        conversations,
        message,
        'NOT_DELETABLE',
        'deleteAt ausente',
      );
      return;
    }
    if (now.getTime() >= deleteAt + RETRY_WINDOW_MS) {
      await this.mark(
        conversations,
        message,
        'EXPIRED',
        message.lastDeleteError,
      );
      return;
    }

    const telegramMessageId = Number(message.telegramMessageId);
    if (!message.telegramChatId || !Number.isSafeInteger(telegramMessageId)) {
      await this.mark(
        conversations,
        message,
        'NOT_DELETABLE',
        'Identificadores de Telegram ausentes o inválidos',
      );
      return;
    }

    try {
      await this.bot.telegram.deleteMessage(
        message.telegramChatId,
        telegramMessageId,
      );
      message.deleteStatus = 'DELETED';
      message.deleteAttempts += 1;
      message.lastDeleteError = null;
      message.deletedFromTelegramAt = now;
      await conversations.save(message);
    } catch (error) {
      const detail = describeError(error).slice(0, 2000);
      const terminal = this.isTerminalTelegramError(error, detail);
      await this.mark(
        conversations,
        message,
        terminal ? 'NOT_DELETABLE' : 'FAILED_RETRYABLE',
        detail,
      );
      this.logger.warn(
        `No se pudo borrar el mensaje ${message.telegramMessageId} del chat ${message.telegramChatId}; ` +
          `${terminal ? 'no admite reintento' : 'se reintentará'}: ${detail}`,
      );
    }
  }

  private async mark(
    conversations: Repository<ConversacionesTelegram>,
    message: ConversacionesTelegram,
    status: 'FAILED_RETRYABLE' | 'EXPIRED' | 'NOT_DELETABLE',
    error: string | null,
  ): Promise<void> {
    message.deleteStatus = status;
    message.deleteAttempts += 1;
    message.lastDeleteError = error;
    await conversations.save(message);
  }

  private isTerminalTelegramError(error: unknown, detail: string): boolean {
    const response = (error as { response?: { error_code?: number } })
      ?.response;
    if (response?.error_code === 403) return true;
    if (response?.error_code !== 400) return false;
    return /message to delete not found|message can't be deleted|chat not found|message identifier is not specified/i.test(
      detail,
    );
  }
}
