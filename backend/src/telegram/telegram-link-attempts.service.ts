import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { TelegramLinkAttempt } from './entities/telegram-link-attempt.entity';

/** Fallos consecutivos antes de bloquear el chat. */
const MAX_ATTEMPTS = 5;
/** Cuanto dura el bloqueo una vez alcanzado el limite. */
const BLOCK_MS = 15 * 60 * 1000;
/** Sin fallos durante este tiempo, el contador vuelve a cero. */
const WINDOW_MS = 15 * 60 * 1000;
/** Los registros mas viejos que esto ya no dicen nada y se pueden borrar. */
const RETENTION_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TelegramLinkAttemptsService {
  constructor(
    @InjectRepository(TelegramLinkAttempt)
    private readonly repository: Repository<TelegramLinkAttempt>,
  ) {}

  /**
   * Minutos que le quedan de bloqueo a este chat, o `null` si puede intentarlo.
   */
  async blockedMinutesLeft(telegramChatId: string): Promise<number | null> {
    const record = await this.repository.findOne({
      where: { telegramChatId },
    });
    if (!record?.blockedUntil) return null;
    const remaining = record.blockedUntil.getTime() - Date.now();
    if (remaining <= 0) return null;
    return Math.ceil(remaining / 60_000);
  }

  /**
   * Anota un fallo. Devuelve `true` si con este se agota el margen y el chat
   * queda bloqueado.
   */
  async registerFailure(telegramChatId: string): Promise<boolean> {
    const record = await this.repository.findOne({ where: { telegramChatId } });

    // Un chat que lleva la ventana entera sin fallar empieza de cero: el limite
    // es contra la rafaga, no un castigo acumulado de por vida.
    const stale = record && Date.now() - record.updatedAt.getTime() > WINDOW_MS;
    const attempts = !record || stale ? 1 : record.attempts + 1;
    const blocked = attempts >= MAX_ATTEMPTS;

    await this.repository.upsert(
      {
        telegramChatId,
        attempts,
        blockedUntil: blocked ? new Date(Date.now() + BLOCK_MS) : null,
      },
      ['telegramChatId'],
    );
    return blocked;
  }

  /** Vinculacion conseguida: el historial de fallos deja de importar. */
  async clear(telegramChatId: string): Promise<void> {
    await this.repository.delete({ telegramChatId });
  }

  /** Purga los registros que ya no influyen en ninguna decision. */
  async purgeOld(): Promise<number> {
    const result = await this.repository.delete({
      updatedAt: LessThan(new Date(Date.now() - RETENTION_MS)),
    });
    return result.affected ?? 0;
  }
}
