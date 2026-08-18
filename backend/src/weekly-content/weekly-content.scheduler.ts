import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WeeklyContentService } from './weekly-content.service';
import { WeeklyContentSchedule } from './entities/weekly-content-schedule.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { TelegramService } from '../telegram/telegram.service';
import { ConductReport } from '../discipline/entities/conduct-report.entity';

@Injectable()
export class WeeklyContentScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WeeklyContentScheduler.name);
  private timer?: any;
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly weeklyContentService: WeeklyContentService,
    private readonly telegramService: TelegramService,
    @InjectRepository(WeeklyContentSchedule)
    private readonly scheduleRepo: Repository<WeeklyContentSchedule>,
    @InjectRepository(Empleadas)
    private readonly empleadasRepo: Repository<Empleadas>,
    @InjectRepository(ConductReport)
    private readonly conductReportRepo: Repository<ConductReport>,
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
        'Bot de Telegram deshabilitado en local; omitiendo programador de contenido semanal.',
      );
      return;
    }

    // Escanear cada 10 minutos
    this.timer = setInterval(() => void this.runCycle(), 10 * 60 * 1000);
    if (typeof (this.timer as any)?.unref === 'function') {
      (this.timer as any).unref();
    }
    const initialTimer: any = setTimeout(() => void this.runCycle(), 10_000);
    if (typeof initialTimer?.unref === 'function') {
      initialTimer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runCycle() {
    if (this.running) return;
    this.running = true;
    try {
      const now = new Date();
      const cdmxDate = new Date(
        now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }),
      );
      const day = cdmxDate.getDay(); // 0 = dom, 5 = vie, 6 = sab
      const hour = cdmxDate.getHours();

      const currentFriday = this.weeklyContentService.getCurrentCycleFriday();

      // 1. VIERNES (>= 10:00 AM): Crear ciclo y solicitar fotos a todas las empleadas activas
      if (day === 5 && hour >= 10) {
        await this.handleFridayRequests(currentFriday);
      }

      // 2. SÁBADO (>= 10:00 AM, 24h después): Enviar recordatorio a las que no han entregado
      if ((day === 6 && hour >= 10) || day === 0) {
        await this.handleSaturdayReminders(currentFriday);
      }

      // 3. DOMINGO (>= 10:00 AM, 48h después): Aplicar falta a las que no han entregado
      if (day === 0 && hour >= 10) {
        await this.handleSundaySanctions(currentFriday);
      }
    } catch (error) {
      this.logger.error('Error en WeeklyContentScheduler:', error);
    } finally {
      this.running = false;
    }
  }

  private async handleFridayRequests(semanaInicio: string) {
    const activeEmployees = await this.empleadasRepo.find({
      where: { catalogoActivo: true },
      relations: { usuario: true },
    });

    for (const emp of activeEmployees) {
      if (!emp.usuario?.telegramChatId) continue;

      let schedule = await this.scheduleRepo.findOne({
        where: { empleadaId: emp.id, semanaInicio },
      });

      if (!schedule) {
        schedule = this.scheduleRepo.create({
          empleadaId: emp.id,
          semanaInicio,
          estado: 'solicitado',
          solicitadoAt: new Date(),
        });
        await this.scheduleRepo.save(schedule);

        try {
          await this.telegramService.sendMessage(
            emp.usuario.telegramChatId,
            `📸 *¡Hola ${emp.nombreArtistico}! Es momento de actualizar tus fotos semanales.*\n\n` +
              `Por favor envía directamente por este chat tus fotos recientes (de buena calidad y atractivas) para renovar tu catálogo del fin de semana.\n` +
              `Tienes hasta el sábado para enviarlas. ¡Quedamos atentos a tus fotos! ✨`,
          );
        } catch (err) {
          this.logger.warn(
            `No se pudo enviar solicitud de fotos a ${emp.nombreArtistico}:`,
            err,
          );
        }
      }
    }
  }

  private async handleSaturdayReminders(semanaInicio: string) {
    const pendingSchedules = await this.scheduleRepo.find({
      where: { semanaInicio, estado: 'solicitado' },
      relations: { empleada: { usuario: true } },
    });

    for (const schedule of pendingSchedules) {
      if (!schedule.empleada?.usuario?.telegramChatId) continue;

      schedule.estado = 'recordatorio_enviado';
      schedule.recordatorioAt = new Date();
      await this.scheduleRepo.save(schedule);

      try {
        await this.telegramService.sendMessage(
          schedule.empleada.usuario.telegramChatId,
          `⚠️ *Recordatorio de Fotos Semanales*\n\n` +
            `Hola ${schedule.empleada.nombreArtistico}, aún no hemos recibido tus fotos para la renovación de tu catálogo de esta semana.\n` +
            `Recuerda enviarlas a la brevedad por este chat para evitar incidencias en tu perfil.`,
        );
      } catch (err) {
        this.logger.warn(
          `No se pudo enviar recordatorio a ${schedule.empleada.nombreArtistico}:`,
          err,
        );
      }
    }
  }

  private async handleSundaySanctions(semanaInicio: string) {
    const missingSchedules = await this.scheduleRepo.find({
      where: [
        { semanaInicio, estado: 'solicitado' },
        { semanaInicio, estado: 'recordatorio_enviado' },
      ],
      relations: { empleada: { usuario: true } },
    });

    for (const schedule of missingSchedules) {
      schedule.estado = 'falta_aplicada';
      schedule.faltaAt = new Date();
      await this.scheduleRepo.save(schedule);

      // Registrar reporte de conducta por incumplimiento
      const report = this.conductReportRepo.create({
        direction: 'system_to_employee' as any,
        reporterType: 'employee',
        reporterId: schedule.empleadaId,
        subjectType: 'employee',
        subjectId: schedule.empleadaId,
        category: 'incumplimiento',
        description: `Incumplimiento de entrega de contenido semanal para el ciclo ${semanaInicio}.`,
        priority: 'alta',
        status: 'en_revision',
      });
      await this.conductReportRepo.save(report);

      if (schedule.empleada?.usuario?.telegramChatId) {
        try {
          await this.telegramService.sendMessage(
            schedule.empleada.usuario.telegramChatId,
            `❌ *Aviso de Incumplimiento*\n\n` +
              `Hola ${schedule.empleada.nombreArtistico}, ha vencido el plazo límite de 48h para la entrega de tus fotos semanales.\n` +
              `Se ha registrado una falta por incumplimiento en tu historial disciplinario. Por favor comunícate con tu jefe o administración.`,
          );
        } catch (err) {
          this.logger.warn(
            `No se pudo notificar falta a ${schedule.empleada.nombreArtistico}:`,
            err,
          );
        }
      }
    }
  }
}
