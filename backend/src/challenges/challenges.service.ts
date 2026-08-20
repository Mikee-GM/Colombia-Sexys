import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RealtimeEventsService } from '../realtime/realtime.service';
import { TelegramService } from '../telegram/telegram.service';
import { Usuarios } from '../users/entities/user.entity';
import { CreateChallengeDto } from './dto/challenges.dto';
import { ChallengeParticipant } from './entities/challenge-participant.entity';
import {
  Challenge,
  ChallengeMetric,
  ChallengeParticipantType,
} from './entities/challenge.entity';

type Actor = Pick<Usuarios, 'id' | 'rol'>;

export type ChallengeStanding = {
  participantId: string;
  name: string;
  value: number;
  position: number;
};

@Injectable()
export class ChallengesService {
  constructor(
    @InjectRepository(Challenge)
    private readonly challenges: Repository<Challenge>,
    @InjectRepository(ChallengeParticipant)
    private readonly participants: Repository<ChallengeParticipant>,
    private readonly dataSource: DataSource,
    private readonly realtime: RealtimeEventsService,
    private readonly telegram: TelegramService,
  ) {}

  async createChallenge(
    dto: CreateChallengeDto,
    actor: Actor,
  ): Promise<ReturnType<ChallengesService['getChallenge']>> {
    this.assertAdminOrJefe(actor);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) {
      throw new BadRequestException(
        'La fecha de cierre debe ser posterior al inicio',
      );
    }
    const uniqueIds = [...new Set(dto.participantIds)];
    if (uniqueIds.length < 2) {
      throw new BadRequestException(
        'Un reto necesita al menos 2 participantes distintos',
      );
    }
    await this.assertParticipantsExist(dto.participantType, uniqueIds);
    if (actor.rol === 'jefe') {
      await this.assertTeamScope(actor.id, dto.participantType, uniqueIds);
    }

    const status = startsAt <= new Date() ? 'active' : 'scheduled';
    const challenge = await this.challenges.save(
      this.challenges.create({
        title: dto.title.trim(),
        participantType: dto.participantType,
        metric: dto.metric,
        status,
        startsAt,
        endsAt,
        createdByUserId: actor.id,
      }),
    );
    await this.participants.save(
      uniqueIds.map((participantId) =>
        this.participants.create({
          challengeId: challenge.id,
          participantId,
        }),
      ),
    );

    this.realtime.emitToJefes({
      type: 'challenges.created',
      challengeId: challenge.id,
      title: challenge.title,
    });

    if (status === 'active') {
      await this.notifyChallengeStarted(challenge.id);
    }

    return this.getChallenge(challenge.id, actor);
  }

  async listChallenges(actor: Actor) {
    this.assertAdminOrJefe(actor);
    const rows = await this.challenges.find({
      where: actor.rol === 'jefe' ? { createdByUserId: actor.id } : {},
      order: { createdAt: 'DESC' },
    });
    return Promise.all(rows.map((row) => this.toSummary(row)));
  }

  async getChallenge(id: string, actor: Actor) {
    this.assertAdminOrJefe(actor);
    const challenge = await this.challenges.findOneBy({ id });
    if (!challenge) throw new NotFoundException('Reto no encontrado');
    this.assertOwnChallenge(challenge, actor);
    const standings = await this.computeStandings(challenge);
    const summary = await this.toSummary(challenge);
    return { ...summary, standings };
  }

  async cancelChallenge(id: string, actor: Actor) {
    this.assertAdminOrJefe(actor);
    const challenge = await this.challenges.findOneBy({ id });
    if (!challenge) throw new NotFoundException('Reto no encontrado');
    this.assertOwnChallenge(challenge, actor);
    if (challenge.status === 'finished' || challenge.status === 'cancelled') {
      throw new BadRequestException('Este reto ya no se puede cancelar');
    }
    challenge.status = 'cancelled';
    challenge.cancelledAt = new Date();
    await this.challenges.save(challenge);
    this.realtime.emitToJefes({
      type: 'challenges.status.changed',
      challengeId: id,
      status: 'cancelled',
    });
    return this.getChallenge(id, actor);
  }

  /** Llamado por el scheduler: activa retos programados cuya fecha de inicio ya llegó. */
  async activateDueChallenges(): Promise<void> {
    const scheduled = await this.challenges.find({
      where: { status: 'scheduled' },
    });
    const now = new Date();
    for (const challenge of scheduled) {
      if (challenge.startsAt > now) continue;
      challenge.status = 'active';
      await this.challenges.save(challenge);
      this.realtime.emitToJefes({
        type: 'challenges.status.changed',
        challengeId: challenge.id,
        status: 'active',
      });
      await this.notifyChallengeStarted(challenge.id);
    }
  }

  /** Llamado por el scheduler: cierra retos activos cuya fecha de fin ya pasó y define ganador. */
  async finishDueChallenges(): Promise<void> {
    const active = await this.challenges.find({ where: { status: 'active' } });
    const now = new Date();
    for (const challenge of active) {
      if (challenge.endsAt > now) continue;
      const standings = await this.computeStandings(challenge);
      challenge.status = 'finished';
      challenge.finishedAt = now;
      challenge.winnerParticipantId = standings[0]?.participantId ?? null;
      challenge.winnerValue =
        standings[0] != null ? String(standings[0].value) : null;
      await this.challenges.save(challenge);
      this.realtime.emitToJefes({
        type: 'challenges.status.changed',
        challengeId: challenge.id,
        status: 'finished',
      });
      await this.notifyChallengeFinished(challenge.id, standings);
    }
  }

  private assertOwnChallenge(challenge: Challenge, actor: Actor) {
    if (actor.rol === 'jefe' && challenge.createdByUserId !== actor.id) {
      throw new ForbiddenException('Este reto no pertenece a su operación');
    }
  }

  private async computeStandings(
    challenge: Challenge,
  ): Promise<ChallengeStanding[]> {
    const rows = await this.participants.find({
      where: { challengeId: challenge.id },
    });
    const participantIds = rows.map((row) => row.participantId);
    if (participantIds.length === 0) return [];
    const windowEnd =
      challenge.endsAt < new Date() ? challenge.endsAt : new Date();
    const values = await this.computeMetricValues(
      challenge.participantType,
      challenge.metric,
      participantIds,
      challenge.startsAt,
      windowEnd,
    );
    const standings = participantIds.map((id) => {
      const data = values.get(id);
      return {
        participantId: id,
        name: data?.name ?? 'Desconocido',
        value: data?.value ?? 0,
      };
    });
    standings.sort((a, b) => b.value - a.value);
    return standings.map((standing, index) => ({
      ...standing,
      position: index + 1,
    }));
  }

  private async computeMetricValues(
    participantType: ChallengeParticipantType,
    metric: ChallengeMetric,
    participantIds: string[],
    windowStart: Date,
    windowEnd: Date,
  ): Promise<Map<string, { name: string; value: number }>> {
    if (metric === 'kpi_score') {
      const nameCol =
        participantType === 'employee' ? 'nombre_artistico' : 'nombre';
      const table = participantType === 'employee' ? 'empleadas' : 'choferes';
      const ratingIdCol =
        participantType === 'employee' ? 'employee_id' : 'driver_id';
      const ratingDirection =
        participantType === 'employee'
          ? 'client_to_employee'
          : 'employee_to_driver';
      const appealFilter =
        participantType === 'employee'
          ? "AND appeal_status NOT IN ('pending','overturned')"
          : '';
      const rows: Array<{
        id: string;
        name: string;
        avg_stars: string | null;
        confirmed: string;
      }> = await this.dataSource.query(
        `SELECT p.id, p.${nameCol} AS name,
           (SELECT AVG(stars) FROM interaction_ratings
             WHERE direction = $4 AND ${ratingIdCol} = p.id ${appealFilter}
               AND created_at BETWEEN $2 AND $3) AS avg_stars,
           COALESCE((SELECT COUNT(*) FROM conduct_reports
             WHERE subject_type = $5 AND subject_id = p.id AND outcome = 'confirmado'
               AND created_at BETWEEN $2 AND $3), 0) AS confirmed
         FROM ${table} p WHERE p.id = ANY($1::uuid[])`,
        [
          participantIds,
          windowStart,
          windowEnd,
          ratingDirection,
          participantType,
        ],
      );
      return new Map(
        rows.map((row) => [
          row.id,
          {
            name: row.name,
            value: Math.max(
              0,
              Math.round(
                (Number(row.avg_stars ?? 0) / 5) * 100 -
                  Number(row.confirmed) * 8,
              ),
            ),
          },
        ]),
      );
    }

    if (metric === 'services') {
      const rows: Array<{ id: string; name: string; value: string }> =
        participantType === 'employee'
          ? await this.dataSource.query(
              `SELECT e.id, e.nombre_artistico AS name,
                 COALESCE((SELECT COUNT(*) FROM servicios s
                   WHERE s.empleada_id = e.id AND s.estado = 'finalizado'
                     AND s.hora_fin_servicio BETWEEN $2 AND $3), 0) AS value
               FROM empleadas e WHERE e.id = ANY($1::uuid[])`,
              [participantIds, windowStart, windowEnd],
            )
          : await this.dataSource.query(
              `SELECT c.id, c.nombre AS name,
                 COALESCE((SELECT COUNT(*) FROM viajes v
                   WHERE v.chofer_id = c.id AND v.estado = 'finalizado'
                     AND v.proveedor_transporte = 'interno'
                     AND v.hora_fin_viaje BETWEEN $2 AND $3), 0) AS value
               FROM choferes c WHERE c.id = ANY($1::uuid[])`,
              [participantIds, windowStart, windowEnd],
            );
      return new Map(
        rows.map((row) => [
          row.id,
          { name: row.name, value: Number(row.value) },
        ]),
      );
    }

    const rows: Array<{ id: string; name: string; value: string }> =
      participantType === 'employee'
        ? await this.dataSource.query(
            `SELECT e.id, e.nombre_artistico AS name,
               COALESCE((SELECT SUM(s.total_final) FROM servicios s
                 WHERE s.empleada_id = e.id AND s.estado = 'finalizado'
                   AND s.hora_fin_servicio BETWEEN $2 AND $3), 0) AS value
             FROM empleadas e WHERE e.id = ANY($1::uuid[])`,
            [participantIds, windowStart, windowEnd],
          )
        : await this.dataSource.query(
            `SELECT c.id, c.nombre AS name,
               COALESCE((SELECT SUM(v.driver_payout) FROM viajes v
                 WHERE v.chofer_id = c.id AND v.estado = 'finalizado'
                   AND v.proveedor_transporte = 'interno'
                   AND v.hora_fin_viaje BETWEEN $2 AND $3), 0) AS value
             FROM choferes c WHERE c.id = ANY($1::uuid[])`,
            [participantIds, windowStart, windowEnd],
          );
    return new Map(
      rows.map((row) => [row.id, { name: row.name, value: Number(row.value) }]),
    );
  }

  private async toSummary(challenge: Challenge) {
    const participantsCount = await this.participants.count({
      where: { challengeId: challenge.id },
    });
    return {
      id: challenge.id,
      title: challenge.title,
      participantType: challenge.participantType,
      metric: challenge.metric,
      status: challenge.status,
      startsAt: challenge.startsAt,
      endsAt: challenge.endsAt,
      createdByUserId: challenge.createdByUserId,
      winnerParticipantId: challenge.winnerParticipantId,
      winnerValue: challenge.winnerValue,
      participantsCount,
      createdAt: challenge.createdAt,
    };
  }

  private async assertParticipantsExist(
    type: ChallengeParticipantType,
    ids: string[],
  ) {
    const table = type === 'employee' ? 'empleadas' : 'choferes';
    const rows = await this.dataSource.query(
      `SELECT id FROM ${table} WHERE id = ANY($1::uuid[])`,
      [ids],
    );
    if (rows.length !== ids.length) {
      throw new BadRequestException('Uno o más participantes no existen');
    }
  }

  private async assertTeamScope(
    bossId: string,
    type: ChallengeParticipantType,
    ids: string[],
  ) {
    const rows: Array<{ id: string }> =
      type === 'employee'
        ? await this.dataSource.query(
            `SELECT id FROM empleadas WHERE id = ANY($1::uuid[]) AND jefe_id = $2`,
            [ids, bossId],
          )
        : await this.dataSource.query(
            `SELECT DISTINCT v.chofer_id AS id FROM viajes v
             JOIN servicios s ON s.id = v.servicio_id
             WHERE v.chofer_id = ANY($1::uuid[]) AND s.jefe_id = $2`,
            [ids, bossId],
          );
    const scoped = new Set(rows.map((row) => row.id));
    const outside = ids.filter((id) => !scoped.has(id));
    if (outside.length > 0) {
      throw new ForbiddenException(
        'Todos los participantes del reto deben pertenecer a su equipo',
      );
    }
  }

  private async participantChatId(
    type: ChallengeParticipantType,
    participantId: string,
  ): Promise<string | null> {
    const table = type === 'employee' ? 'empleadas' : 'choferes';
    const rows: Array<{ telegram_chat_id: string | null }> =
      await this.dataSource.query(
        `SELECT u.telegram_chat_id FROM ${table} p
         JOIN usuarios u ON u.id = p.usuario_id WHERE p.id = $1`,
        [participantId],
      );
    return rows[0]?.telegram_chat_id ? String(rows[0].telegram_chat_id) : null;
  }

  private metricLabel(metric: ChallengeMetric): string {
    if (metric === 'kpi_score') return 'puntaje de desempeño';
    if (metric === 'services') return 'servicios completados';
    return 'ingresos generados';
  }

  private async participantNames(
    type: ChallengeParticipantType,
    ids: string[],
  ): Promise<Map<string, string>> {
    const table = type === 'employee' ? 'empleadas' : 'choferes';
    const nameCol = type === 'employee' ? 'nombre_artistico' : 'nombre';
    const rows: Array<{ id: string; name: string }> =
      await this.dataSource.query(
        `SELECT id, ${nameCol} AS name FROM ${table} WHERE id = ANY($1::uuid[])`,
        [ids],
      );
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  private async notifyChallengeStarted(challengeId: string) {
    const challenge = await this.challenges.findOneBy({ id: challengeId });
    if (!challenge) return;
    const rows = await this.participants.find({ where: { challengeId } });
    const metricLabel = this.metricLabel(challenge.metric);
    const endsAtLabel = challenge.endsAt.toLocaleDateString('es-CO', {
      day: 'numeric',
      month: 'long',
    });
    const names = await this.participantNames(
      challenge.participantType,
      rows.map((row) => row.participantId),
    );

    for (const row of rows) {
      const chatId = await this.participantChatId(
        challenge.participantType,
        row.participantId,
      );
      if (!chatId) continue;
      const opponents = rows
        .filter((other) => other.participantId !== row.participantId)
        .map((other) => names.get(other.participantId) ?? 'un participante')
        .join(', ');
      const message =
        `Empieza el reto "${challenge.title}"\n\n` +
        `Compites por ${metricLabel} contra: ${opponents || 'otros participantes'}.\n` +
        `Termina el ${endsAtLabel}.`;
      try {
        await this.telegram.sendMessage(chatId, message);
      } catch {
        // best-effort, no interrumpe el ciclo por un fallo de Telegram
      }
    }
  }

  private async notifyChallengeFinished(
    challengeId: string,
    standings: ChallengeStanding[],
  ) {
    const challenge = await this.challenges.findOneBy({ id: challengeId });
    if (!challenge || standings.length === 0) return;
    const metricLabel = this.metricLabel(challenge.metric);
    const winner = standings[0];
    const resultLines = standings
      .map(
        (standing) =>
          `${standing.position}. ${standing.name} — ${standing.value}`,
      )
      .join('\n');
    for (const standing of standings) {
      const chatId = await this.participantChatId(
        challenge.participantType,
        standing.participantId,
      );
      if (!chatId) continue;
      const headline =
        standing.participantId === winner.participantId
          ? `¡Ganaste el reto "${challenge.title}"!`
          : `El reto "${challenge.title}" terminó. Ganó ${winner.name}.`;
      const message = `${headline}\n\nResultado final (${metricLabel}):\n${resultLines}`;
      try {
        await this.telegram.sendMessage(chatId, message);
      } catch {
        // best-effort, no interrumpe el ciclo por un fallo de Telegram
      }
    }
  }

  private assertAdminOrJefe(actor: Actor) {
    if (actor.rol !== 'admin' && actor.rol !== 'jefe') {
      throw new ForbiddenException(
        'Solo un administrador o jefe puede gestionar retos',
      );
    }
  }
}
