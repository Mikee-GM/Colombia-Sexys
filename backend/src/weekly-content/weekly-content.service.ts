import {
  Injectable,
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
import { UploadService } from '../upload/upload.service';

@Injectable()
export class WeeklyContentService {
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
   * Registrar una nueva foto subida por una modelo vía Telegram
   */
  async recordTelegramPhotoSubmission(
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
   * Validar una foto semanal: Aprobar (Pública o Privada) o Rechazar
   */
  async reviewSubmission(
    submissionId: string,
    action: 'aprobar_publica' | 'aprobar_privada' | 'rechazar',
    reviewerUser: Usuarios,
  ): Promise<WeeklyPhotoSubmission> {
    const submission = await this.submissionRepo.findOne({
      where: { id: submissionId },
      relations: { empleada: true },
    });

    if (!submission) {
      throw new NotFoundException('Foto semanal no encontrada.');
    }

    submission.revisadoPorUserId = reviewerUser.id;
    submission.revisadoAt = new Date();

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
    } else {
      throw new BadRequestException('Acción no válida.');
    }

    return await this.submissionRepo.save(submission);
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
    // Convertir a horario CDMX
    const cdmxDate = new Date(
      now.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }),
    );
    const day = cdmxDate.getDay(); // 0 = domingo, 5 = viernes, 6 = sábado
    // Días a retroceder hasta el viernes (si es viernes es 0)
    const diff = (day + 7 - 5) % 7;
    const friday = new Date(cdmxDate);
    friday.setDate(cdmxDate.getDate() - diff);

    const year = friday.getFullYear();
    const month = String(friday.getMonth() + 1).padStart(2, '0');
    const date = String(friday.getDate()).padStart(2, '0');
    return `${year}-${month}-${date}`;
  }
}
