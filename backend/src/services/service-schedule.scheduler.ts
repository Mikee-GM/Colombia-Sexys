import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  ADVISORY_LOCKS,
  withAdvisoryLock,
} from '../common/scheduling/advisory-lock';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Markup } from 'telegraf';
import { Servicios } from './entities/service.entity';
import { AiMessageService } from '../ai/ai-message.service';
import { TelegramBotRegistryService } from '../telegram/telegram-bot-registry.service';
import { describeError } from '../common/errors/error-message';
import { APP_TIME_ZONE, APP_LOCALE } from '../common/locale';

@Injectable()
export class ServiceScheduleScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ServiceScheduleScheduler.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    @InjectRepository(Servicios)
    private readonly serviciosRepository: Repository<Servicios>,
    @InjectBot()
    private readonly bot: Telegraf<any>,
    private readonly configService: ConfigService,
    private readonly aiMessageService: AiMessageService,
    private readonly botRegistry: TelegramBotRegistryService,
    private readonly dataSource: DataSource,
  ) {}

  /** La empleada y su cliente hablan por el bot dedicado de ella, si lo tiene. */
  private botFor(employeeId?: string | null): Telegraf<any> {
    return this.botRegistry.botForEmployeeOrCentral(employeeId);
  }

  onModuleInit() {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN', '');
    if (
      !token ||
      token.includes('dummy') ||
      token.includes('fake') ||
      token.startsWith('123456789')
    ) {
      this.logger.log(
        'Bot de Telegram deshabilitado en local; omitiendo programador de citas.',
      );
      return;
    }
    // Check every 60 seconds
    this.timer = setInterval(() => void this.runCycle(), 60 * 1000);
    if (typeof this.timer?.unref === 'function') this.timer.unref();
    const initialTimer = setTimeout(() => void this.runCycle(), 10_000);
    if (typeof initialTimer.unref === 'function') initialTimer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * El guard `running` evita solapes dentro del proceso; el advisory lock evita
   * que dos replicas manden el mismo recordatorio al mismo cliente.
   */
  private async runCycle() {
    if (this.running) return;
    this.running = true;
    try {
      await withAdvisoryLock(
        this.dataSource,
        ADVISORY_LOCKS.serviceSchedule,
        () => this.checkUpcomingScheduledServices(),
      );
    } catch (error) {
      this.logger.warn(
        `Error en el ciclo de citas programadas: ${describeError(error)}`,
      );
    } finally {
      this.running = false;
    }
  }

  async checkUpcomingScheduledServices(): Promise<void> {
    const now = Date.now();
    const alertThreshold = now + 45 * 60 * 1000; // 45 minutes from now

    const scheduledServices = await this.serviciosRepository.find({
      where: {
        estado: 'agendado',
        tipoAgenda: 'programado',
        notificacionPreviaEnviada: false,
      },
      relations: {
        cliente: true,
        empleada: { usuario: true, jefe: true },
        jefe: true,
      },
    });

    for (const service of scheduledServices) {
      if (!service.fechaProgramada) continue;
      const appointmentTime = new Date(service.fechaProgramada).getTime();

      if (appointmentTime <= alertThreshold) {
        service.notificacionPreviaEnviada = true;
        await this.serviciosRepository.save(service);

        const horaStr = new Date(service.fechaProgramada).toLocaleTimeString(
          APP_LOCALE,
          {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: APP_TIME_ZONE,
          },
        );

        // 1. Notificar a la Empleada
        const empChatId = service.empleada?.usuario?.telegramChatId;
        if (empChatId && empChatId !== '111111111') {
          try {
            await this.botFor(service.empleadaId).telegram.sendMessage(
              empChatId,
              `⏰ *Recordatorio de Cita Próxima (en 45 min):*\n\n` +
                `Tu servicio con *${
                  service.cliente?.nombreTelegram || 'el cliente'
                }* está programado para las *${horaStr}*.\n` +
                `Por favor prepárate para el traslado.`,
              { parse_mode: 'Markdown' },
            );
          } catch (err) {
            this.logger.error(
              `Error notificando recordatorio a la empleada ${service.empleadaId}:`,
              err,
            );
          }
        }

        // 2. Notificar al Jefe con opciones de transporte
        const bossGroupId =
          service.jefe?.grupoTelegramId ||
          service.empleada?.jefe?.grupoTelegramId;
        const threadId = service.telegramThreadId
          ? Number(service.telegramThreadId)
          : undefined;

        if (bossGroupId) {
          const transportButtons = Markup.inlineKeyboard([
            [
              Markup.button.callback(
                '🚗 Despachar Chofer',
                `sched_trans:${service.id}:chofer`,
              ),
              Markup.button.callback(
                '🚗 Pedir Uber',
                `sched_trans:${service.id}:uber`,
              ),
            ],
          ]);

          try {
            await this.bot.telegram.sendMessage(
              bossGroupId,
              `⏰ *Recordatorio de Cita Próxima (en 45 min):*\n\n` +
                `• *Empleada:* ${service.empleada?.nombreArtistico || 'Empleada'}\n` +
                `• *Cliente:* ${service.cliente?.nombreTelegram || 'Cliente'}\n` +
                `• *Hora de Cita:* ${horaStr}\n` +
                `• *Transporte preferido:* ${(
                  service.transporteAgendado || 'No asignado'
                ).toUpperCase()}\n\n` +
                `Elige el transporte para iniciar el traslado:`,
              {
                parse_mode: 'Markdown',
                message_thread_id: threadId,
                ...transportButtons,
              },
            );
          } catch (err) {
            this.logger.error(
              `Error notificando recordatorio al jefe de servicio ${service.id}:`,
              err,
            );
          }
        }

        // 3. Notificar al Cliente mediante la IA
        if (service.cliente?.telegramChatId) {
          try {
            const clientMsg = await this.aiMessageService.generate(
              'appointment_reminder',
              {
                employeeName:
                  service.empleada?.nombreArtistico || 'Tu anfitriona',
              },
              `Hola amor, te confirmo que todo está listo para nuestra cita de las ${horaStr}, ya me estoy preparando.`,
            );
            await this.botFor(service.empleadaId).telegram.sendMessage(
              service.cliente.telegramChatId,
              clientMsg,
              { parse_mode: 'Markdown' },
            );
          } catch (err) {
            this.logger.error(
              `Error notificando recordatorio al cliente de servicio ${service.id}:`,
              err,
            );
          }
        }
      }
    }
  }
}
