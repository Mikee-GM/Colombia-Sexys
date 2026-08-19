import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { In, Repository } from 'typeorm';
import { RealtimeEventsService } from '../realtime/realtime.service';
import {
  CreateCandidateScreeningDto,
  CreateScreeningQuestionDto,
  ReorderScreeningQuestionsDto,
  UpdateScreeningQuestionDto,
} from './dto/candidate-screening.dto';
import { CandidateScreening } from './entities/candidate-screening.entity';
import { CandidateScreeningAnswer } from './entities/candidate-screening-answer.entity';
import { ScreeningQuestion } from './entities/screening-question.entity';

@Injectable()
export class CandidateScreeningService {
  constructor(
    @InjectRepository(ScreeningQuestion)
    private readonly questions: Repository<ScreeningQuestion>,
    @InjectRepository(CandidateScreening)
    private readonly screenings: Repository<CandidateScreening>,
    @InjectRepository(CandidateScreeningAnswer)
    private readonly answers: Repository<CandidateScreeningAnswer>,
    private readonly realtime: RealtimeEventsService,
  ) {}

  // ---------- Banco de preguntas ----------

  listQuestions() {
    return this.questions.find({ order: { order: 'ASC', createdAt: 'ASC' } });
  }

  async createQuestion(dto: CreateScreeningQuestionDto) {
    const maxOrder = await this.questions
      .createQueryBuilder('q')
      .select('MAX(q.order)', 'max')
      .getRawOne<{ max: number | null }>();
    return this.questions.save(
      this.questions.create({
        text: dto.text.trim(),
        order: (maxOrder?.max ?? 0) + 1,
      }),
    );
  }

  async updateQuestion(id: string, dto: UpdateScreeningQuestionDto) {
    const question = await this.questions.findOneBy({ id });
    if (!question) throw new NotFoundException('Pregunta no encontrada');
    if (dto.text !== undefined) question.text = dto.text.trim();
    if (dto.active !== undefined) question.active = dto.active;
    return this.questions.save(question);
  }

  async deleteQuestion(id: string) {
    const question = await this.questions.findOneBy({ id });
    if (!question) throw new NotFoundException('Pregunta no encontrada');
    await this.questions.remove(question);
    return { deleted: true };
  }

  async reorderQuestions(dto: ReorderScreeningQuestionsDto) {
    await Promise.all(
      dto.questionIds.map((id, index) =>
        this.questions.update({ id }, { order: index + 1 }),
      ),
    );
    return this.listQuestions();
  }

  // ---------- Evaluaciones de candidatas ----------

  async listScreenings(status?: CandidateScreening['status']) {
    return this.screenings.find({
      where: status ? { status } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async getScreeningDetail(id: string) {
    const screening = await this.screenings.findOne({
      where: { id },
      relations: { createdBy: true, promotedEmployee: true, answers: true },
    });
    if (!screening) throw new NotFoundException('Evaluación no encontrada');
    screening.answers?.sort(
      (a, b) =>
        new Date(a.answeredAt).getTime() - new Date(b.answeredAt).getTime(),
    );
    return screening;
  }

  async createScreening(
    dto: CreateCandidateScreeningDto,
    createdByUserId: string,
  ) {
    const questions = await this.questions.findBy({ id: In(dto.questionIds) });
    if (questions.length !== dto.questionIds.length) {
      throw new BadRequestException(
        'Alguna de las preguntas seleccionadas ya no existe',
      );
    }
    const token = randomBytes(9).toString('base64url');
    return this.screenings.save(
      this.screenings.create({
        candidateName: dto.candidateName.trim(),
        candidatePhone: dto.candidatePhone?.trim() || null,
        token,
        status: 'pendiente',
        questionIds: dto.questionIds,
        createdByUserId,
      }),
    );
  }

  async markPromoted(id: string, employeeId: string) {
    const screening = await this.screenings.findOneBy({ id });
    if (!screening) throw new NotFoundException('Evaluación no encontrada');
    screening.promotedEmployeeId = employeeId;
    return this.screenings.save(screening);
  }

  // ---------- Flujo por Telegram ----------

  async getScreeningByToken(token: string) {
    return this.screenings.findOne({ where: { token } });
  }

  async bindTelegram(screeningId: string, telegramChatId: string) {
    const screening = await this.screenings.findOneBy({ id: screeningId });
    if (!screening) throw new NotFoundException('Evaluación no encontrada');
    if (screening.status === 'completado') {
      throw new ConflictException('Esta evaluación ya fue completada');
    }
    screening.telegramChatId = telegramChatId;
    if (screening.status === 'pendiente') {
      screening.status = 'en_progreso';
      screening.startedAt = new Date();
    }
    return this.screenings.save(screening);
  }

  /** Regresa la siguiente pregunta sin responder, o null si ya se contestaron todas. */
  async getNextQuestion(screeningId: string) {
    const screening = await this.screenings.findOneBy({ id: screeningId });
    if (!screening) throw new NotFoundException('Evaluación no encontrada');
    const answered = await this.answers.find({
      where: { screeningId },
      select: { questionId: true },
    });
    const answeredIds = new Set(answered.map((a) => a.questionId));
    const nextId = screening.questionIds.find((id) => !answeredIds.has(id));
    if (!nextId) return null;
    const question = await this.questions.findOneBy({ id: nextId });
    if (!question) throw new NotFoundException('Pregunta no encontrada');
    return {
      question,
      index: answeredIds.size + 1,
      total: screening.questionIds.length,
    };
  }

  async submitAnswer(screeningId: string, answerText: string) {
    const screening = await this.screenings.findOneBy({ id: screeningId });
    if (!screening) throw new NotFoundException('Evaluación no encontrada');
    if (screening.status === 'completado') {
      throw new ConflictException('Esta evaluación ya fue completada');
    }
    const next = await this.getNextQuestion(screeningId);
    if (!next) throw new ConflictException('No quedan preguntas por responder');

    await this.answers.save(
      this.answers.create({
        screeningId,
        questionId: next.question.id,
        questionText: next.question.text,
        answerText: answerText.trim().slice(0, 4000),
      }),
    );

    const remaining = await this.getNextQuestion(screeningId);
    if (!remaining) {
      screening.status = 'completado';
      screening.completedAt = new Date();
      await this.screenings.save(screening);
      this.realtime.emitToJefes({
        type: 'candidate_screening.completed',
        screeningId: screening.id,
        candidateName: screening.candidateName,
      });
      return { completed: true as const };
    }
    return { completed: false as const, question: remaining };
  }
}
