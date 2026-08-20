import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChallengesService } from './challenges.service';

@Injectable()
export class ChallengesScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChallengesScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly challenges: ChallengesService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN', '');
    if (
      !token ||
      token.includes('dummy') ||
      token.includes('fake') ||
      token.startsWith('123456789')
    ) {
      this.logger.log(
        'Bot de Telegram deshabilitado en local; omitiendo programador de retos.',
      );
      return;
    }
    this.timer = setInterval(() => void this.runCycle(), 5 * 60 * 1000);
    if (typeof this.timer?.unref === 'function') this.timer.unref();
    const initialTimer = setTimeout(() => void this.runCycle(), 15_000);
    if (typeof initialTimer.unref === 'function') initialTimer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  private async runCycle() {
    if (this.running) return;
    this.running = true;
    try {
      await this.challenges.activateDueChallenges();
      await this.challenges.finishDueChallenges();
    } catch (error) {
      this.logger.warn(
        `Error en el ciclo de retos: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.running = false;
    }
  }
}
