import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Choferes } from '../drivers/entities/driver.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { TelegramService } from '../telegram/telegram.service';
import {
  AssignDriverShiftDto,
  CreateDriverShiftDto,
  UpdateDriverShiftDto,
} from './dto/driver-shifts.dto';
import { DriverShiftAssignment } from './entities/driver-shift-assignment.entity';
import { DriverShift } from './entities/driver-shift.entity';

@Injectable()
export class DriverShiftsService {
  private readonly logger = new Logger(DriverShiftsService.name);

  constructor(
    @InjectRepository(DriverShift)
    private readonly shifts: Repository<DriverShift>,
    @InjectRepository(DriverShiftAssignment)
    private readonly assignments: Repository<DriverShiftAssignment>,
    @InjectRepository(Choferes)
    private readonly choferesRepository: Repository<Choferes>,
    private readonly notifications: NotificationsService,
    private readonly dataSource: DataSource,
    private readonly telegram: TelegramService,
  ) {}

  async createShift(
    dto: CreateDriverShiftDto,
    createdByUserId: string,
  ): Promise<DriverShift> {
    if (dto.startsAt === dto.endsAt) {
      throw new BadRequestException(
        'La hora de inicio y fin del turno no pueden ser iguales',
      );
    }
    return this.shifts.save(
      this.shifts.create({
        title: dto.title.trim(),
        startsAt: dto.startsAt,
        endsAt: dto.endsAt,
        daysOfWeek: [...new Set(dto.daysOfWeek)].sort(),
        capacity: dto.capacity ?? null,
        createdByUserId,
      }),
    );
  }

  async updateShift(
    id: string,
    dto: UpdateDriverShiftDto,
  ): Promise<DriverShift> {
    const shift = await this.getShiftOrFail(id);
    const startsAt = dto.startsAt ?? shift.startsAt;
    const endsAt = dto.endsAt ?? shift.endsAt;
    if (startsAt === endsAt) {
      throw new BadRequestException(
        'La hora de inicio y fin del turno no pueden ser iguales',
      );
    }
    if (dto.title !== undefined) shift.title = dto.title.trim();
    shift.startsAt = startsAt;
    shift.endsAt = endsAt;
    if (dto.daysOfWeek !== undefined) {
      shift.daysOfWeek = [...new Set(dto.daysOfWeek)].sort();
    }
    if (dto.capacity !== undefined) shift.capacity = dto.capacity;
    return this.shifts.save(shift);
  }

  async deactivateShift(id: string): Promise<DriverShift> {
    const shift = await this.getShiftOrFail(id);
    shift.active = false;
    return this.shifts.save(shift);
  }

  async listShifts() {
    const shifts = await this.shifts.find({ order: { createdAt: 'DESC' } });
    if (shifts.length === 0) return [];
    const counts = await this.assignments
      .createQueryBuilder('a')
      .select('a.shiftId', 'shiftId')
      .addSelect('COUNT(*)::int', 'count')
      .where('a.shiftId IN (:...ids)', { ids: shifts.map((s) => s.id) })
      .groupBy('a.shiftId')
      .getRawMany<{ shiftId: string; count: number }>();
    const countByShift = new Map(counts.map((c) => [c.shiftId, c.count]));
    return shifts.map((shift) => ({
      ...shift,
      assignedCount: countByShift.get(shift.id) ?? 0,
    }));
  }

  async getShift(id: string) {
    const shift = await this.getShiftOrFail(id);
    const rows = await this.assignments.find({ where: { shiftId: id } });
    const driverIds = rows.map((row) => row.driverId);
    const scored = await this.scoreDrivers(driverIds);
    const assignedDrivers = scored.sort((a, b) => b.score - a.score);
    return { ...shift, assignedDrivers };
  }

  /**
   * Choferes elegibles para este turno, ordenados por score descendente.
   *
   * Elegible significa con cuenta activa y sin veto disciplinario vigente, no
   * "libre en este momento". Antes se filtraba por `disponible`, que es el
   * estado de despacho: se pone en `true` cuando el chofer se marca listo y
   * vuelve a `false` mientras hace un viaje, y nace en `false`. Con eso la
   * lista de candidatos salia casi siempre vacia y el turno no se le podia
   * asignar a nadie, aunque asignar un turno es planear la semana y no repartir
   * el viaje de ahora.
   */
  async listCandidates(shiftId: string) {
    const shift = await this.getShiftOrFail(shiftId);
    const alreadyAssigned = await this.assignments.find({
      where: { shiftId },
    });
    const excludedIds = new Set(alreadyAssigned.map((row) => row.driverId));

    const drivers = await this.choferesRepository.find({
      where: { usuario: { activo: true } },
      relations: { usuario: true },
      select: { id: true, nombre: true, disponible: true },
    });

    const bannedIds = await this.listBannedDriverIds(
      drivers.map((driver) => driver.id),
    );

    const eligible = drivers.filter(
      (driver) => !excludedIds.has(driver.id) && !bannedIds.has(driver.id),
    );
    const scored = await this.scoreDrivers(eligible.map((d) => d.id));

    /* `disponible` viaja como dato informativo: ya no decide quien aparece. */
    const disponiblePorId = new Map(
      drivers.map((driver) => [driver.id, driver.disponible]),
    );

    return {
      shiftId: shift.id,
      capacity: shift.capacity,
      assignedCount: alreadyAssigned.length,
      candidates: scored
        .map((candidate) => ({
          ...candidate,
          disponible: disponiblePorId.get(candidate.id) ?? false,
        }))
        .sort((a, b) => b.score - a.score),
    };
  }

  /**
   * Choferes con una sancion vigente que impide programarlos. Un veto activo
   * no deberia poder entrar a la malla de turnos de la semana siguiente.
   */
  private async listBannedDriverIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows: Array<{ subject_id: string }> = await this.dataSource.query(
      `SELECT DISTINCT subject_id
         FROM disciplinary_sanctions
        WHERE subject_type = 'driver'
          AND status = 'active'
          AND starts_at <= now()
          AND (type = 'permanent_ban' OR ends_at > now())
          AND subject_id = ANY($1::uuid[])`,
      [ids],
    );
    return new Set(rows.map((row) => row.subject_id));
  }

  /**
   * Turnos de un chofer concreto, para operar desde su ficha.
   *
   * La API de turnos estaba centrada en el turno: para saber que tiene asignado
   * un chofer habia que abrir cada turno y mirar su lista. Desde la ficha del
   * chofer hace falta la vista contraria, y en una sola peticion, porque el
   * modal necesita las dos listas a la vez.
   *
   * `disponibles` excluye los turnos inactivos y los que ya estan al tope: si
   * el modal los ofreciera, asignarlos fallaria con un conflicto.
   */
  async listShiftsForDriver(driverId: string) {
    const driver = await this.choferesRepository.findOneBy({ id: driverId });
    if (!driver) throw new NotFoundException('Chofer no encontrado');

    const [shifts, misAsignaciones, conteos] = await Promise.all([
      this.shifts.find({ order: { createdAt: 'DESC' } }),
      this.assignments.find({ where: { driverId } }),
      this.assignments
        .createQueryBuilder('a')
        .select('a.shiftId', 'shiftId')
        .addSelect('COUNT(*)::int', 'count')
        .groupBy('a.shiftId')
        .getRawMany<{ shiftId: string; count: number }>(),
    ]);

    const asignados = new Set(misAsignaciones.map((row) => row.shiftId));
    const ocupacion = new Map(conteos.map((row) => [row.shiftId, row.count]));

    const conConteo = (shift: DriverShift) => ({
      ...shift,
      assignedCount: ocupacion.get(shift.id) ?? 0,
    });

    return {
      driverId,
      assigned: shifts.filter((s) => asignados.has(s.id)).map(conConteo),
      available: shifts
        .filter((shift) => {
          if (asignados.has(shift.id) || !shift.active) return false;
          if (shift.capacity == null) return true;
          return (ocupacion.get(shift.id) ?? 0) < shift.capacity;
        })
        .map(conConteo),
    };
  }

  async assignDriver(
    shiftId: string,
    dto: AssignDriverShiftDto,
  ): Promise<DriverShift> {
    const shift = await this.getShiftOrFail(shiftId);
    const driver = await this.choferesRepository.findOneBy({
      id: dto.driverId,
    });
    if (!driver) throw new NotFoundException('Chofer no encontrado');
    const existing = await this.assignments.findOneBy({
      shiftId,
      driverId: dto.driverId,
    });
    if (existing) {
      throw new ConflictException('El chofer ya está asignado a este turno');
    }
    if (shift.capacity != null) {
      const currentCount = await this.assignments.countBy({ shiftId });
      if (currentCount >= shift.capacity) {
        throw new ConflictException(
          'El turno está en su capacidad máxima; retira a un chofer de menor desempeño antes de agregar a otro',
        );
      }
    }
    await this.assignments.save(
      this.assignments.create({ shiftId, driverId: dto.driverId }),
    );
    await this.notifyDriver(
      dto.driverId,
      `Se te asignó el turno "${shift.title}" (${shift.startsAt}-${shift.endsAt}, ${this.formatDays(shift.daysOfWeek)}). ` +
        `Fuera de ese horario no recibirás ofertas de viaje automáticas.`,
    );
    /*
     * Nivel 2: organiza su semana, pero no es algo que resuelva en el momento.
     *
     * En su propio try/catch: el turno ya esta asignado y un aviso que falla no
     * puede deshacerlo.
     */
    try {
      await this.notifications.notificar(driver.usuarioId, {
        titulo: 'Te asignaron un turno',
        cuerpo: 'Toca para ver tus turnos en el portal.',
        url: '/chofer/portal',
        tag: `turno-${shift.id}`,
      });
    } catch (err) {
      this.logger.error('Error enviando el aviso push del turno:', err);
    }

    return shift;
  }

  async unassignDriver(shiftId: string, driverId: string): Promise<void> {
    const existing = await this.assignments.findOneBy({ shiftId, driverId });
    if (!existing) {
      throw new NotFoundException('El chofer no está asignado a este turno');
    }
    const shift = await this.getShiftOrFail(shiftId);
    await this.assignments.remove(existing);
    await this.notifyDriver(
      driverId,
      `Se te retiró del turno "${shift.title}". Si no tienes otros turnos asignados, vuelves a estar disponible para ofertas de viaje en cualquier horario.`,
    );
  }

  private async notifyDriver(driverId: string, message: string) {
    const rows: Array<{ telegram_chat_id: string | null }> =
      await this.dataSource.query(
        `SELECT u.telegram_chat_id FROM choferes c
         JOIN usuarios u ON u.id = c.usuario_id WHERE c.id = $1`,
        [driverId],
      );
    const chatId = rows[0]?.telegram_chat_id;
    if (!chatId) return;
    try {
      await this.telegram.sendMessage(String(chatId), message);
    } catch {
      // best-effort, no interrumpe el flujo por un fallo de Telegram
    }
  }

  private formatDays(daysOfWeek: number[]): string {
    const labels = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    return [...daysOfWeek]
      .sort((a, b) => a - b)
      .map((day) => labels[day])
      .join(', ');
  }

  private async getShiftOrFail(id: string): Promise<DriverShift> {
    const shift = await this.shifts.findOneBy({ id });
    if (!shift) throw new NotFoundException('Turno no encontrado');
    return shift;
  }

  /** Mismo score que los KPIs de choferes: calificación (0-5 → 0-100) menos reportes confirmados en 90 días. */
  private async scoreDrivers(
    driverIds: string[],
  ): Promise<Array<{ id: string; nombre: string; score: number }>> {
    if (driverIds.length === 0) return [];
    const rows: Array<{ id: string; nombre: string; score: string }> =
      await this.dataSource.query(
        `SELECT c.id, c.nombre,
           GREATEST(0, ROUND(
             COALESCE((SELECT AVG(stars) FROM interaction_ratings
               WHERE direction = 'employee_to_driver' AND driver_id = c.id), 2.5) / 5 * 100
             - COALESCE((SELECT COUNT(*) FROM conduct_reports
               WHERE subject_type = 'driver' AND subject_id = c.id AND outcome = 'confirmado'
                 AND created_at >= now() - interval '90 days'), 0) * 8
           )) AS score
         FROM choferes c WHERE c.id = ANY($1::uuid[])`,
        [driverIds],
      );
    return rows.map((row) => ({
      id: row.id,
      nombre: row.nombre,
      score: Number(row.score),
    }));
  }
}
