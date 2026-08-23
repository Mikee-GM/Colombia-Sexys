import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { TelegramSession } from './entities/telegram-session.entity';
import { withAdvisoryLock } from '../common/scheduling/advisory-lock';
import { describeError } from '../common/errors/error-message';

const SESSION_TTL_DAYS = 30;
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000; // cada 6 horas
const SESSION_SWEEP_LOCK = 811_005;

/**
 * Purga las sesiones de Telegram inactivas.
 *
 * El store de sesiones escribe una fila por conversacion y nada las borraba: la
 * tabla crecia indefinidamente con cada cliente que hablaba una vez con el bot.
 */
@Injectable()
export class TelegramSessionMaintenance
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TelegramSessionMaintenance.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(TelegramSession)
    private readonly sessions: Repository<TelegramSession>,
    private readonly dataSource: DataSource,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async sweep(): Promise<void> {
    try {
      await withAdvisoryLock(this.dataSource, SESSION_SWEEP_LOCK, async () => {
        const cutoff = new Date(
          Date.now() - SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
        );
        const { affected } = await this.sessions.delete({
          updatedAt: LessThan(cutoff),
        });
        if (affected) {
          this.logger.log(
            `Purgadas ${affected} sesiones de Telegram inactivas más de ${SESSION_TTL_DAYS} días`,
          );
        }
      });
    } catch (error) {
      this.logger.warn(
        `No se pudieron purgar las sesiones de Telegram: ${describeError(
          error,
        )}`,
      );
    }
  }
}
