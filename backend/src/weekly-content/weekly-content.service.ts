import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  WeeklyPhotoSubmission,
  SubmissionStatus,
} from './entities/weekly-photo-submission.entity';
import { WeeklyContentSchedule } from './entities/weekly-content-schedule.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { EmpleadaFotos } from '../employee-photos/entities/employee-photo.entity';
import { EmpleadaFotosExclusivas } from '../employee-photos/entities/employee-private-photo.entity';
import { Usuarios } from '../users/entities/user.entity';
import {
  UploadService,
  type UploadedFilePayload,
} from '../upload/upload.service';
import { TelegramService } from '../telegram/telegram.service';
import { botonesDePortal } from '../telegram/telegram-portal-buttons';
import { PanelAccessService } from '../auth/panel-access.service';
import { APP_TIME_ZONE } from '../common/locale';

/** Tope por envio. Evita que un descuido cargue la galeria entera del telefono. */
const MAX_PHOTOS_POR_ENVIO = 12;

/** Destino del pase que acompaña al aviso: el portal, ya en sus fotos. */
const PORTAL_FOTOS_PATH = '/empleada/portal?seccion=fotos';

/**
 * Quita del texto los caracteres con los que Telegram marca formato.
 *
 * El motivo del rechazo lo escribe una persona y viaja dentro de un mensaje en
 * Markdown: un asterisco o un corchete sueltos dejan el marcado sin cerrar y
 * Telegram responde 400 sin entregar nada, asi que el aviso se perdia entero
 * por un caracter. El Markdown antiguo no admite escapado fiable, de modo que
 * se retiran; ninguno hace falta para explicar que corregir en una foto.
 */
function sinMarcasMarkdown(texto: string): string {
  return texto.replace(/[*_`[\]]/g, '');
}

@Injectable()
export class WeeklyContentService {
  private readonly logger = new Logger(WeeklyContentService.name);

  constructor(
    @InjectRepository(WeeklyPhotoSubmission)
    private readonly submissionRepo: Repository<WeeklyPhotoSubmission>,
    @InjectRepository(WeeklyContentSchedule)
    private readonly scheduleRepo: Repository<WeeklyContentSchedule>,
    @InjectRepository(Empleadas)
    private readonly empleadasRepo: Repository<Empleadas>,
    @InjectRepository(EmpleadaFotos)
    private readonly fotosRepo: Repository<EmpleadaFotos>,
    @InjectRepository(EmpleadaFotosExclusivas)
    private readonly fotosExclusivasRepo: Repository<EmpleadaFotosExclusivas>,
    private readonly uploadService: UploadService,
    /*
     * Los dos ultimos entran por el aviso de rechazo: el motivo tiene que
     * llegarle a la modelo por Telegram, con el pase que le abre el portal en
     * sus fotos para que pueda reemplazarla sin buscar el enlace.
     */
    private readonly telegramService: TelegramService,
    private readonly panelAccessService: PanelAccessService,
  ) {}

  /**
   * Obtener todas las fotos pendientes o el historial de una modelo
   */
  async getSubmissionsByEmployee(
    empleadaId: string,
    onlyPending = false,
  ): Promise<WeeklyPhotoSubmission[]> {
    const where: any = { empleadaId };
    if (onlyPending) {
      where.estado = 'pendiente';
    }
    return this.submissionRepo.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Cola de revision completa, para la pantalla de Fotos y Contenido del ERP.
   *
   * getSubmissionsByEmployee resuelve una modelo a la vez, asi que una cola
   * global habria requerido una peticion por modelo. Devuelve la empleada
   * resuelta para poder mostrar nombre y foto de perfil junto a cada envio.
   */
  async listSubmissions(
    estado?: SubmissionStatus,
    limit = 60,
  ): Promise<WeeklyPhotoSubmission[]> {
    return this.submissionRepo.find({
      where: estado ? { estado } : {},
      relations: { empleada: true },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 200),
    });
  }

  /**
   * Obtener el conteo de fotos pendientes por modelo agrupado
   */
  async getPendingCountByEmployee(): Promise<Record<string, number>> {
    const result = await this.submissionRepo
      .createQueryBuilder('sub')
      .select('sub.empleadaId', 'empleadaId')
      .addSelect('COUNT(sub.id)', 'count')
      .where('sub.estado = :estado', { estado: 'pendiente' })
      .groupBy('sub.empleadaId')
      .getRawMany();

    const counts: Record<string, number> = {};
    for (const row of result) {
      counts[row.empleadaId] = parseInt(row.count, 10) || 0;
    }
    return counts;
  }

  /**
   * Obtener el estado del contenido semanal (si está al día, atrasado o con fotos por revisar)
   */
  async getWeeklyStatusForEmployees(): Promise<
    Record<string, 'al_dia' | 'atrasado' | 'pendiente_revision'>
  > {
    const currentFriday = this.getCurrentCycleFriday();
    const schedules = await this.scheduleRepo.find({
      where: { semanaInicio: currentFriday },
    });
    const pendingCounts = await this.getPendingCountByEmployee();

    const statuses: Record<
      string,
      'al_dia' | 'atrasado' | 'pendiente_revision'
    > = {};
    for (const schedule of schedules) {
      if (pendingCounts[schedule.empleadaId] > 0) {
        statuses[schedule.empleadaId] = 'pendiente_revision';
      } else if (schedule.estado === 'falta_aplicada') {
        statuses[schedule.empleadaId] = 'atrasado';
      } else {
        statuses[schedule.empleadaId] = 'al_dia';
      }
    }
    return statuses;
  }

  /**
   * Estado del contenido semanal de una sola modelo, con el detalle que
   * necesita su portal: cuantos recordatorios lleva, cuantos le quedan y si ya
   * se le aplico la multa.
   *
   * `getWeeklyStatusForEmployees` resuelve el estado de todas a la vez para el
   * ERP, pero se queda en la etiqueta; aqui hace falta el porque.
   */
  async getWeeklyStatusForEmployee(empleadaId: string): Promise<{
    semanaInicio: string;
    estado: 'al_dia' | 'atrasado' | 'pendiente_revision' | 'sin_solicitar';
    recordatoriosEnviados: number;
    maxRecordatorios: number;
    /** Avisos que quedan antes de que se aplique la multa. */
    recordatoriosRestantes: number;
    entregoEstaSemana: boolean;
    fotosPendientesDeRevision: number;
    multaAplicadaAt: string | null;
    importeMulta: number;
  }> {
    const semanaInicio = this.getCurrentCycleFriday();
    const { maxRecordatorios, importeMulta } = await this.getFinePolicy();

    const [schedule, fotosPendientes] = await Promise.all([
      this.scheduleRepo.findOne({ where: { empleadaId, semanaInicio } }),
      this.submissionRepo.count({
        where: { empleadaId, semanaInicio, estado: 'pendiente' },
      }),
    ]);

    const recordatoriosEnviados = schedule?.recordatoriosEnviados ?? 0;
    const entregoEstaSemana =
      schedule?.estado === 'entregado' || fotosPendientes > 0;

    let estado: 'al_dia' | 'atrasado' | 'pendiente_revision' | 'sin_solicitar';
    if (!schedule) {
      estado = 'sin_solicitar';
    } else if (fotosPendientes > 0) {
      estado = 'pendiente_revision';
    } else if (schedule.estado === 'entregado') {
      estado = 'al_dia';
    } else {
      estado = 'atrasado';
    }

    return {
      semanaInicio,
      estado,
      recordatoriosEnviados,
      maxRecordatorios,
      recordatoriosRestantes: Math.max(
        0,
        maxRecordatorios - recordatoriosEnviados,
      ),
      entregoEstaSemana,
      fotosPendientesDeRevision: fotosPendientes,
      multaAplicadaAt: schedule?.multaAplicadaAt
        ? schedule.multaAplicadaAt.toISOString()
        : null,
      importeMulta,
    };
  }

  /**
   * Politica de multa vigente.
   *
   * Se lee con SQL crudo en vez de inyectar `LiquidationsService` porque el
   * modulo de liquidaciones ya depende de este por otro lado y la inyeccion
   * cerraria el ciclo. Si la fila no existe se usan los valores por defecto:
   * el ciclo semanal no puede quedarse parado por una tabla sin migrar.
   */
  async getFinePolicy(): Promise<{
    maxRecordatorios: number;
    importeMulta: number;
  }> {
    try {
      const [row]: Array<{
        weekly_content_max_reminders: number;
        weekly_content_fine_amount: string | number;
      }> = await this.scheduleRepo.query(
        `SELECT weekly_content_max_reminders, weekly_content_fine_amount
           FROM liquidation_settings WHERE id = 1`,
      );
      if (row) {
        return {
          maxRecordatorios: Number(row.weekly_content_max_reminders) || 3,
          importeMulta: Number(row.weekly_content_fine_amount) || 0,
        };
      }
    } catch {
      // Tabla aun sin migrar: se sigue con los valores por defecto.
    }
    return { maxRecordatorios: 3, importeMulta: 300 };
  }

  /**
   * Registrar una foto semanal subida por la modelo.
   *
   * El origen ya no cambia nada: antes solo entraban por Telegram y ahora la
   * via oficial es el portal, pero el registro y el cierre del ciclo son los
   * mismos.
   */
  async recordPhotoSubmission(
    empleadaId: string,
    url: string,
  ): Promise<WeeklyPhotoSubmission> {
    const semanaInicio = this.getCurrentCycleFriday();

    // 1. Guardar la submission
    const submission = this.submissionRepo.create({
      empleadaId,
      url,
      estado: 'pendiente',
      semanaInicio,
    });
    const saved = await this.submissionRepo.save(submission);

    // 2. Actualizar o crear el schedule de la semana como entregado
    let schedule = await this.scheduleRepo.findOne({
      where: { empleadaId, semanaInicio },
    });
    if (schedule) {
      schedule.estado = 'entregado';
      schedule.entregadoAt = new Date();
      await this.scheduleRepo.save(schedule);
    } else {
      schedule = this.scheduleRepo.create({
        empleadaId,
        semanaInicio,
        estado: 'entregado',
        solicitadoAt: new Date(),
        entregadoAt: new Date(),
      });
      await this.scheduleRepo.save(schedule);
    }

    return saved;
  }

  /**
   * Subida de fotos semanales desde el portal de la modelo.
   *
   * Es la via oficial desde que se retiro la de Telegram: alli las fotos
   * llegaban al chat sin que la modelo pudiera ver cuales habia mandado ni
   * corregirse, y cualquier foto suelta en la conversacion entraba a la cola de
   * revision aunque no fuera contenido semanal.
   *
   * Se aceptan varias en una sola peticion porque nadie manda una sola foto, y
   * cada archivo pasa por la misma validacion de imagen que el resto del panel.
   */
  async submitPortalPhotos(
    empleadaId: string,
    files: UploadedFilePayload[],
  ): Promise<{ subidas: WeeklyPhotoSubmission[]; semanaInicio: string }> {
    if (!files?.length) {
      throw new BadRequestException('No se recibió ninguna foto.');
    }
    if (files.length > MAX_PHOTOS_POR_ENVIO) {
      throw new BadRequestException(
        `Puedes subir hasta ${MAX_PHOTOS_POR_ENVIO} fotos por envío.`,
      );
    }

    const empleada = await this.empleadasRepo.findOne({
      where: { id: empleadaId },
    });
    if (!empleada) {
      throw new NotFoundException('Perfil de empleada no encontrado.');
    }

    const subidas: WeeklyPhotoSubmission[] = [];
    for (const file of files) {
      const { url } = await this.uploadService.uploadFile(file);
      subidas.push(await this.recordPhotoSubmission(empleadaId, url));
    }

    return { subidas, semanaInicio: this.getCurrentCycleFriday() };
  }

  /**
   * Fotos que la modelo mando esta semana, con su estado de revision.
   *
   * El portal las muestra para que sepa que llego y en que quedo: sin esto la
   * subida era un buzon ciego.
   */
  async getCurrentCycleSubmissions(
    empleadaId: string,
  ): Promise<WeeklyPhotoSubmission[]> {
    return this.submissionRepo.find({
      where: { empleadaId, semanaInicio: this.getCurrentCycleFriday() },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Validar una foto semanal: Aprobar (Pública o Privada) o Rechazar.
   *
   * El rechazo admite un motivo: se guarda para que la modelo lo vea en su
   * portal y se le manda por Telegram. Sin el, "No aprobada" no le decia que
   * corregir y volvia a mandar la misma clase de foto.
   */
  async reviewSubmission(
    submissionId: string,
    action: 'aprobar_publica' | 'aprobar_privada' | 'rechazar',
    reviewerUser: Usuarios,
    motivo?: string,
  ): Promise<WeeklyPhotoSubmission> {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      // El usuario de la empleada entra por el aviso de rechazo: es quien
      // tiene el chat de Telegram al que se manda el motivo.
      relations: { empleada: { usuario: true } },
    });

    if (!submission) {
      throw new NotFoundException('Foto semanal no encontrada.');
    }

    submission.revisadoPorUserId = reviewerUser.id;
    submission.revisadoAt = new Date();
    // Se limpia siempre: si una foto rechazada se acaba aprobando, el motivo
    // anterior no debe quedarse colgando en el portal.
    submission.motivoRechazo = null;

    if (action === 'aprobar_publica') {
      submission.estado = 'aprobada_publica';
      // Obtener el orden maximo actual en fotos publicas
      const fotosActuales = await this.fotosRepo.find({
        where: { empleadaId: submission.empleadaId },
        order: { orden: 'DESC' },
      });
      const maxOrden =
        fotosActuales.length > 0 ? (fotosActuales[0].orden || 0) + 1 : 0;

      const nuevaFotoPublica = this.fotosRepo.create({
        empleadaId: submission.empleadaId,
        url: submission.url,
        orden: maxOrden,
      });
      await this.fotosRepo.save(nuevaFotoPublica);
    } else if (action === 'aprobar_privada') {
      submission.estado = 'aprobada_privada';
      // Obtener el orden maximo actual en fotos privadas
      const fotosPrivadas = await this.fotosExclusivasRepo.find({
        where: { empleadaId: submission.empleadaId },
        order: { orden: 'DESC' },
      });
      const maxOrden =
        fotosPrivadas.length > 0 ? (fotosPrivadas[0].orden || 0) + 1 : 0;

      const nuevaFotoPrivada = this.fotosExclusivasRepo.create({
        empleadaId: submission.empleadaId,
        url: submission.url,
        orden: maxOrden,
      });
      await this.fotosExclusivasRepo.save(nuevaFotoPrivada);
    } else if (action === 'rechazar') {
      submission.estado = 'rechazada';
      submission.motivoRechazo = motivo?.trim() || null;
    } else {
      throw new BadRequestException('Acción no válida.');
    }

    const guardada = await this.submissionRepo.save(submission);

    if (action === 'rechazar') {
      await this.avisarRechazo(submission);
    }

    return guardada;
  }

  /**
   * Avisa por Telegram de una foto rechazada.
   *
   * El aviso sale aunque no haya motivo: enterarse de que hay que reenviarla
   * ya es la mitad del recado, y esperar a que la modelo entre al portal por su
   * cuenta significaba, en la practica, que se enteraba dias despues.
   *
   * Nada de esto puede tumbar la revision: la decision ya esta guardada cuando
   * se llama, asi que un fallo de Telegram se registra y se sigue.
   */
  private async avisarRechazo(
    submission: WeeklyPhotoSubmission,
  ): Promise<void> {
    const usuario = submission.empleada?.usuario;
    if (!usuario?.telegramChatId) return;

    const nombre = submission.empleada?.nombreArtistico ?? '';
    const texto = [
      '*Una de tus fotos no fue aprobada*',
      '',
      nombre ? `Hola ${sinMarcasMarkdown(nombre)}.` : 'Hola.',
      submission.motivoRechazo
        ? `Motivo: ${sinMarcasMarkdown(submission.motivoRechazo)}`
        : 'Administración no aprobó una de las fotos que enviaste esta semana.',
      '',
      'Puedes subir otra desde tu portal para reemplazarla.',
    ].join('\n');

    let botones: ReturnType<typeof botonesDePortal> | undefined;
    try {
      const { url } = await this.panelAccessService.issueLink(
        usuario.id,
        usuario.telegramChatId,
        PORTAL_FOTOS_PATH,
      );
      botones = botonesDePortal(url, 'Subir otra foto');
    } catch (error) {
      // Sin boton se sigue: quedarse sin aviso es peor que quedarse sin atajo.
      this.logger.warn(
        `No se pudo adjuntar el acceso al portal para ${submission.empleadaId}:`,
        error,
      );
    }

    await this.telegramService
      .sendMessage(usuario.telegramChatId, texto, {
        parseMode: 'Markdown',
        buttons: botones,
      })
      .catch((fallo) =>
        this.logger.warn(
          `No se pudo avisar del rechazo a ${submission.empleadaId}:`,
          fallo,
        ),
      );
  }

  /**
   * Borrar una foto ya revisada: quita la copia publicada (catalogo o
   * exclusivas), el registro de la cola y, si nadie mas la usa, el archivo en R2.
   *
   * Solo aplica a fotos ya revisadas; las pendientes se resuelven con
   * reviewSubmission para que quede registro de quien decidio.
   */
  async deleteSubmission(
    submissionId: string,
  ): Promise<{ deleted: true; id: string }> {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException('Foto semanal no encontrada.');
    }

    if (submission.estado === 'pendiente') {
      throw new BadRequestException(
        'Una foto pendiente debe aprobarse o rechazarse antes de borrarse.',
      );
    }

    await this.fotosRepo.delete({
      empleadaId: submission.empleadaId,
      url: submission.url,
    });
    await this.fotosExclusivasRepo.delete({
      empleadaId: submission.empleadaId,
      url: submission.url,
    });
    await this.submissionRepo.delete({ id: submission.id });

    // Si la modelo tiene esa misma imagen como foto de perfil, el archivo sigue
    // en uso y borrarlo dejaria el perfil roto.
    const enUsoComoPerfil = await this.empleadasRepo.count({
      where: { id: submission.empleadaId, fotoPerfilUrl: submission.url },
    });

    if (enUsoComoPerfil === 0) {
      try {
        await this.uploadService.deleteFile(submission.url);
      } catch {
        // Un archivo huerfano en R2 no debe bloquear el borrado del registro.
      }
    }

    return { deleted: true, id: submission.id };
  }

  /**
   * Retorna la fecha (YYYY-MM-DD) del viernes más reciente o del ciclo actual
   */
  getCurrentCycleFriday(): string {
    const now = new Date();
    // Convertir a la hora local de la operacion
    const localDate = new Date(
      now.toLocaleString('en-US', { timeZone: APP_TIME_ZONE }),
    );
    const day = localDate.getDay(); // 0 = domingo, 5 = viernes, 6 = sábado
    // Días a retroceder hasta el viernes (si es viernes es 0)
    const diff = (day + 7 - 5) % 7;
    const friday = new Date(localDate);
    friday.setDate(localDate.getDate() - diff);

    const year = friday.getFullYear();
    const month = String(friday.getMonth() + 1).padStart(2, '0');
    const date = String(friday.getDate()).padStart(2, '0');
    return `${year}-${month}-${date}`;
  }
}
