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
import { WeeklyContentService } from './weekly-content.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WeeklyContentSchedule } from './entities/weekly-content-schedule.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { TelegramService } from '../telegram/telegram.service';
import { botonesDePortal } from '../telegram/telegram-portal-buttons';
import { PanelAccessService } from '../auth/panel-access.service';
import { ConductReport } from '../discipline/entities/conduct-report.entity';
import { APP_TIME_ZONE } from '../common/locale';

/** Destino del pase: el portal, abierto ya en la seccion de fotos. */
const PORTAL_FOTOS_PATH = '/empleada/portal?seccion=fotos';

@Injectable()
export class WeeklyContentScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WeeklyContentScheduler.name);
  private timer?: any;
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly weeklyContentService: WeeklyContentService,
    private readonly notifications: NotificationsService,
    private readonly telegramService: TelegramService,
    private readonly panelAccessService: PanelAccessService,
    @InjectRepository(WeeklyContentSchedule)
    private readonly scheduleRepo: Repository<WeeklyContentSchedule>,
    @InjectRepository(Empleadas)
    private readonly empleadasRepo: Repository<Empleadas>,
    @InjectRepository(ConductReport)
    private readonly conductReportRepo: Repository<ConductReport>,
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
        'Bot de Telegram deshabilitado en local; omitiendo programador de contenido semanal.',
      );
      return;
    }

    // Escanear cada 10 minutos
    this.timer = setInterval(() => void this.runCycle(), 10 * 60 * 1000);
    if (typeof this.timer?.unref === 'function') {
      this.timer.unref();
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
      // Advisory lock: sin el, dos replicas pedirian las fotos y aplicarian las
      // multas del mismo ciclo por duplicado.
      await withAdvisoryLock(
        this.dataSource,
        ADVISORY_LOCKS.weeklyContent,
        () => this.runWeeklyCycle(),
      );
    } catch (error) {
      this.logger.error('Error en WeeklyContentScheduler:', error);
    } finally {
      this.running = false;
    }
  }

  /**
   * Ciclo semanal de contenido.
   *
   * Viernes se piden las fotos; sabado, domingo y lunes sale un recordatorio
   * por dia; al agotarse el ultimo sin fotos se carga la multa. Los avisos se
   * cuentan dentro de la semana: el contador vuelve a cero con la solicitud del
   * viernes siguiente.
   *
   * Se manda un recordatorio por dia --y no cada N horas-- para que el aviso
   * caiga siempre a una hora en la que la modelo esta despierta.
   */
  private async runWeeklyCycle(): Promise<void> {
    const now = new Date();
    const localDate = new Date(
      now.toLocaleString('en-US', { timeZone: APP_TIME_ZONE }),
    );
    const day = localDate.getDay(); // 0 = dom, 1 = lun, 5 = vie, 6 = sab
    const hour = localDate.getHours();

    const currentFriday = this.weeklyContentService.getCurrentCycleFriday();

    // 1. VIERNES (>= 10:00): crear el ciclo y pedir las fotos.
    if (day === 5 && hour >= 10) {
      await this.handleFridayRequests(currentFriday);
    }

    // 2. SÁBADO, DOMINGO y LUNES (>= 10:00): un recordatorio por dia mientras
    //    queden avisos por gastar.
    if ([6, 0, 1].includes(day) && hour >= 10) {
      await this.handleReminders(currentFriday);
    }

    // 3. Agotados los recordatorios, la multa. Se evalua tras los avisos, pero
    //    solo dispara cuando el contador ya llego al tope, asi que el ultimo
    //    recordatorio y la multa nunca caen en la misma pasada.
    if ([0, 1, 2].includes(day) && hour >= 10) {
      await this.handleExhaustedReminders(currentFriday);
    }
  }

  private async handleFridayRequests(semanaInicio: string) {
    const activeEmployees = await this.empleadasRepo.find({
      where: { catalogoActivo: true },
      relations: { usuario: true },
    });

    for (const emp of activeEmployees) {
      if (!emp.usuario?.telegramChatId) continue;

      const schedule = await this.scheduleRepo.findOne({
        where: { empleadaId: emp.id, semanaInicio },
      });
      if (schedule) continue;

      await this.scheduleRepo.save(
        this.scheduleRepo.create({
          empleadaId: emp.id,
          semanaInicio,
          estado: 'solicitado',
          solicitadoAt: new Date(),
          recordatoriosEnviados: 0,
        }),
      );

      await this.enviarAvisoDeFotos(emp.usuario, {
        nombre: emp.nombreArtistico,
        titulo: 'Toca renovar tus fotos de la semana',
        cuerpo: [
          'Sube tus fotos recientes desde tu portal para renovar tu catalogo',
          'del fin de semana. Ya no hace falta mandarlas por este chat.',
        ].join('\n'),
      });
    }
  }

  /**
   * Un recordatorio por dia mientras queden avisos.
   *
   * El filtro es el contador y no el estado: `recordatorio_enviado` era un
   * estado terminal que impedia mandar un segundo aviso. El estado se conserva
   * porque el resto del sistema lo lee, pero quien decide es el contador.
   */
  private async handleReminders(semanaInicio: string) {
    const { maxRecordatorios } =
      await this.weeklyContentService.getFinePolicy();

    const pendientes = await this.scheduleRepo.find({
      where: [
        { semanaInicio, estado: 'solicitado' },
        { semanaInicio, estado: 'recordatorio_enviado' },
      ],
      relations: { empleada: { usuario: true } },
    });

    for (const schedule of pendientes) {
      const usuario = schedule.empleada?.usuario;
      if (!usuario?.telegramChatId) continue;
      if (schedule.recordatoriosEnviados >= maxRecordatorios) continue;

      // Un solo aviso por dia: si el de hoy ya salio, se espera al siguiente.
      if (this.yaAvisadoHoy(schedule.recordatorioAt)) continue;

      const numero = schedule.recordatoriosEnviados + 1;
      const restantes = maxRecordatorios - numero;

      /*
       * Nivel 2: tiene plazo, no urgencia. Pero se le cobra una multa si se le
       * pasa, asi que enterarse tarde le cuesta dinero.
       */
      if (usuario.id) {
        try {
          await this.notifications.notificar(usuario.id, {
            titulo: 'Te faltan tus fotos de la semana',
            cuerpo:
              restantes > 0
                ? `Te quedan ${restantes} recordatorios antes de la multa.`
                : 'Es el último recordatorio antes de la multa.',
            url: '/empleada/portal?seccion=fotos',
            tag: `fotos-${schedule.id}`,
          });
        } catch (err) {
          this.logger.error(
            'Error enviando el aviso push de las fotos semanales:',
            err,
          );
        }
      }

      schedule.estado = 'recordatorio_enviado';
      schedule.recordatorioAt = new Date();
      schedule.recordatoriosEnviados = numero;
      await this.scheduleRepo.save(schedule);

      await this.enviarAvisoDeFotos(usuario, {
        nombre: schedule.empleada.nombreArtistico,
        titulo: `Recordatorio ${numero} de ${maxRecordatorios}`,
        cuerpo: [
          'Todavia no recibimos tus fotos de esta semana.',
          restantes > 0
            ? `Te ${restantes === 1 ? 'queda' : 'quedan'} ${restantes} ${
                restantes === 1 ? 'aviso' : 'avisos'
              } antes de que se aplique la multa.`
            : 'Este es el ultimo aviso: si no las subes, se aplicara la multa.',
        ].join('\n'),
      });
    }
  }

  /**
   * Multa a quien agoto sus avisos sin subir nada.
   *
   * Sustituye al reporte de conducta que se abria antes y se quedaba esperando
   * a que alguien lo revisara: la consecuencia ahora es inmediata y visible en
   * el corte. El reporte se sigue registrando para que quede en el historial
   * disciplinario, pero ya no es lo unico que pasa.
   */
  private async handleExhaustedReminders(semanaInicio: string) {
    const { maxRecordatorios, importeMulta } =
      await this.weeklyContentService.getFinePolicy();

    const pendientes = await this.scheduleRepo.find({
      where: [
        { semanaInicio, estado: 'solicitado' },
        { semanaInicio, estado: 'recordatorio_enviado' },
      ],
      relations: { empleada: { usuario: true } },
    });

    for (const schedule of pendientes) {
      if (schedule.recordatoriosEnviados < maxRecordatorios) continue;
      if (schedule.multaAplicadaAt) continue;

      const aplicada = new Date();
      schedule.estado = 'falta_aplicada';
      schedule.faltaAt = aplicada;
      schedule.multaAplicadaAt = aplicada;
      schedule.multaLiquidationRecordId = await this.registrarMulta(
        schedule.empleadaId,
        semanaInicio,
        importeMulta,
        aplicada,
      );
      await this.scheduleRepo.save(schedule);

      const registrada = Boolean(schedule.multaLiquidationRecordId);

      await this.conductReportRepo.save(
        this.conductReportRepo.create({
          direction: 'system_to_employee' as any,
          reporterType: 'employee',
          reporterId: schedule.empleadaId,
          subjectType: 'employee',
          subjectId: schedule.empleadaId,
          category: 'incumplimiento',
          description:
            `Incumplimiento de entrega de contenido semanal para el ciclo ${semanaInicio}. ` +
            `Se agotaron los ${maxRecordatorios} recordatorios` +
            (registrada ? ' y se aplico la multa correspondiente.' : '.'),
          priority: 'alta',
          status: 'en_revision',
        }),
      );

      const usuario = schedule.empleada?.usuario;
      if (!usuario?.telegramChatId) continue;

      await this.enviarAvisoDeFotos(usuario, {
        nombre: schedule.empleada.nombreArtistico,
        titulo: 'Se aplico una multa por tus fotos semanales',
        cuerpo: [
          `Se agotaron los ${maxRecordatorios} recordatorios sin recibir tus fotos.`,
          registrada
            ? `Se cargo una multa de $${importeMulta.toFixed(2)} a tu corte de esta semana.`
            : 'Se registro el incumplimiento en tu historial.',
          'Todavia puedes subirlas desde tu portal para regularizar tu catalogo.',
        ].join('\n'),
      });
    }
  }

  /** Si ya se le aviso hoy, en hora de la operacion. */
  private yaAvisadoHoy(ultimo: Date | null): boolean {
    if (!ultimo) return false;
    const dia = (fecha: Date) =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: APP_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(fecha);
    return dia(ultimo) === dia(new Date());
  }

  /**
   * Escribe la multa como registro del corte.
   *
   * `registered_by_user_id` no admite nulos y detras de una multa automatica no
   * hay ningun administrador, asi que se firma con el jefe de la modelo, que es
   * quien responde por ella, y si no tuviera, con cualquier administrador
   * activo. Sin ninguno de los dos no se registra: es preferible quedarse sin
   * multa que reventar el ciclo de todas las demas.
   */
  private async registrarMulta(
    empleadaId: string,
    semanaInicio: string,
    importe: number,
    occurredAt: Date,
  ): Promise<string | null> {
    if (importe <= 0) return null;

    try {
      const firmantes: Array<{ id: string; rol: string }> =
        await this.dataSource.query(
          `SELECT u.id, u.rol, 0 AS prioridad
             FROM empleadas e
             JOIN usuarios u
               ON u.id = COALESCE(e.jefe_id, e.jefe_secundario_id)
            WHERE e.id = $1 AND u.activo = true
            UNION ALL
           SELECT id, rol, 1 AS prioridad
             FROM usuarios
            WHERE rol = 'admin' AND activo = true
            ORDER BY prioridad
            LIMIT 1`,
          [empleadaId],
        );

      const firmante = firmantes[0];
      if (!firmante) {
        this.logger.warn(
          `Sin jefe ni administrador activo para firmar la multa de ${empleadaId}.`,
        );
        return null;
      }

      const insertadas: Array<{ id: string }> = await this.dataSource.query(
        `INSERT INTO liquidation_records
           (employee_id, registered_by_user_id, source_role, occurred_at,
            service_total, payment_method, cash_amount, card_amounts,
            company_percentage, is_fine, fine_amount, place)
         VALUES ($1, $2, $3, $4, 0, 'efectivo', 0, '[]'::jsonb, 0, true, $5, $6)
         RETURNING id`,
        [
          empleadaId,
          firmante.id,
          firmante.rol === 'admin' ? 'admin' : 'jefe',
          occurredAt,
          importe,
          `Multa: fotos semanales no entregadas (ciclo ${semanaInicio})`,
        ],
      );

      return insertadas[0]?.id ?? null;
    } catch (error) {
      this.logger.error(
        `No se pudo registrar la multa de contenido semanal de ${empleadaId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Manda un aviso de fotos con el boton que abre el portal en su seccion.
   *
   * El pase es de un solo uso y de vida corta, igual que el del comando
   * /portal: el enlace viaja por un chat cuyo historial no controlamos.
   *
   * Si el pase no se puede emitir, el aviso sale igual pero sin boton: quedarse
   * sin recordatorio es peor que quedarse sin atajo.
   */
  private async enviarAvisoDeFotos(
    usuario: { id: string; telegramChatId: string | null },
    mensaje: { nombre: string; titulo: string; cuerpo: string },
  ): Promise<void> {
    if (!usuario.telegramChatId) return;

    const texto = [
      `*${mensaje.titulo}*`,
      '',
      `Hola ${mensaje.nombre}.`,
      mensaje.cuerpo,
    ].join('\n');

    let botones: ReturnType<typeof botonesDePortal> | undefined;
    try {
      const { url } = await this.panelAccessService.issueLink(
        usuario.id,
        usuario.telegramChatId,
        PORTAL_FOTOS_PATH,
      );
      botones = botonesDePortal(url, 'Subir mis fotos');
    } catch (error) {
      this.logger.warn(
        `No se pudo adjuntar el acceso al portal para ${mensaje.nombre}:`,
        error,
      );
    }

    await this.telegramService
      .sendMessage(usuario.telegramChatId, texto, {
        parseMode: 'Markdown',
        buttons: botones,
      })
      .catch((fallo) =>
        this.logger.warn(`No se pudo avisar a ${mensaje.nombre}:`, fallo),
      );
  }
}
