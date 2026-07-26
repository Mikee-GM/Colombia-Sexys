import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmployeeOnboardingService } from '../employee-onboarding/employee-onboarding.service';
import { TelegramOnboardingService } from './telegram-onboarding.service';

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
  ) {}

  onModuleInit() {
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
      const pending = await this.onboardingService.findPendingDeliveries();
      for (const assignment of pending) {
        try {
          await this.telegramOnboardingService.deliverAssignment(assignment);
        } catch (error) {
          this.logger.warn(
            `Falló el envío pendiente ${assignment.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      const reminderHours = this.configService.get<number>(
        'ONBOARDING_REMINDER_HOURS',
        3,
      );
      const cutoff = new Date(Date.now() - reminderHours * 60 * 60 * 1000);
      const dueReminders =
        await this.onboardingService.findDueReminders(cutoff);
      for (const assignment of dueReminders) {
        if (!assignment.user?.telegramChatId) continue;
        try {
          await this.telegramOnboardingService.sendReminder(assignment);
        } catch (error) {
          this.logger.warn(
            `Falló el recordatorio ${assignment.id}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        'Falló la revisión de incorporaciones',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
