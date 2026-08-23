import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import {
  ADVISORY_LOCKS,
  withAdvisoryLock,
} from '../common/scheduling/advisory-lock';
import { EmployeeOnboardingService } from '../employee-onboarding/employee-onboarding.service';
import { TelegramOnboardingService } from './telegram-onboarding.service';
import { describeError } from '../common/errors/error-message';

@Injectable()
export class TelegramOnboardingScheduler
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TelegramOnboardingScheduler.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly onboardingService: EmployeeOnboardingService,
    private readonly telegramOnboardingService: TelegramOnboardingService,
    private readonly dataSource: DataSource,
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
        'Bot de Telegram deshabilitado en local; omitiendo programador de onboarding.',
      );
      return;
    }
    const intervalMs = this.configService.get<number>(
      'ONBOARDING_SCAN_INTERVAL_MS',
      60_000,
    );
    this.timer = setInterval(() => void this.run(), intervalMs);
    this.timer.unref();
    setTimeout(() => void this.run(), 5_000).unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async run() {
    if (this.running) return;
    this.running = true;
    try {
      // Advisory lock: dos replicas barriendo a la vez enviarian el reglamento
      // y el recordatorio dos veces a la misma empleada.
      await withAdvisoryLock(
        this.dataSource,
        ADVISORY_LOCKS.onboardingReminders,
        () => this.deliverPendingAndRemind(),
      );
    } catch (error) {
      this.logger.warn(
        `Error en el ciclo de onboarding: ${describeError(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  private async deliverPendingAndRemind(): Promise<void> {
    const pending = await this.onboardingService.findPendingDeliveries();
    for (const assignment of pending) {
      try {
        await this.telegramOnboardingService.deliverAssignment(assignment);
      } catch (error) {
        this.logger.warn(
          `Falló el envío pendiente ${assignment.id}: ${describeError(error)}`,
        );
      }
    }

    const reminderHours = this.configService.get<number>(
      'ONBOARDING_REMINDER_HOURS',
      3,
    );
    const cutoff = new Date(Date.now() - reminderHours * 60 * 60 * 1000);
    const dueReminders = await this.onboardingService.findDueReminders(cutoff);
    for (const assignment of dueReminders) {
      if (!assignment.user?.telegramChatId) continue;
      try {
        await this.telegramOnboardingService.sendReminder(assignment);
      } catch (error) {
        this.logger.warn(
          `Falló el recordatorio ${assignment.id}: ${describeError(error)}`,
        );
      }
    }
  }
}
