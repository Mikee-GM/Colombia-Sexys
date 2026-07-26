import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, In, Repository } from 'typeorm';
import { Empleadas } from '../employees/entities/employee.entity';
import { Usuarios } from '../users/entities/user.entity';
import { PublishRegulationDto } from './dto/publish-regulation.dto';
import { EmployeeOnboarding } from './entities/employee-onboarding.entity';
import { EmployeeRegulation } from './entities/employee-regulation.entity';
import { QuestionnaireAnswer } from './entities/questionnaire-answer.entity';
import { QuestionnaireAttempt } from './entities/questionnaire-attempt.entity';
import { RegulationOption } from './entities/regulation-option.entity';
import { RegulationQuestion } from './entities/regulation-question.entity';

export interface QuestionnaireProgress {
  completed: boolean;
  passed?: boolean;
  score?: number;
  bestScore?: number;
  trustScore?: number;
  attemptCount?: number;
  passingScore?: number;
  correctAnswers?: number;
  totalQuestions?: number;
  question?: RegulationQuestion;
}

@Injectable()
export class EmployeeOnboardingService {
  constructor(
    @InjectRepository(EmployeeRegulation)
    private readonly regulationRepository: Repository<EmployeeRegulation>,
    @InjectRepository(RegulationQuestion)
    private readonly questionRepository: Repository<RegulationQuestion>,
    @InjectRepository(RegulationOption)
    private readonly optionRepository: Repository<RegulationOption>,
    @InjectRepository(EmployeeOnboarding)
    private readonly onboardingRepository: Repository<EmployeeOnboarding>,
    @InjectRepository(QuestionnaireAttempt)
    private readonly attemptRepository: Repository<QuestionnaireAttempt>,
    @InjectRepository(QuestionnaireAnswer)
    private readonly answerRepository: Repository<QuestionnaireAnswer>,
    @InjectRepository(Empleadas)
    private readonly employeeRepository: Repository<Empleadas>,
    @InjectRepository(Usuarios)
    private readonly userRepository: Repository<Usuarios>,
    private readonly dataSource: DataSource,
  ) {}

  async getCurrentRegulation(targetRole: 'empleada' | 'chofer' | 'jefe' = 'empleada') {
    const regulation = await this.regulationRepository.findOne({
      where: { targetRole },
      order: { updatedAt: 'DESC' },
    });
    if (!regulation) {
      throw new NotFoundException('No hay un reglamento publicado');
    }

    const questions = await this.questionRepository.find({
      where: {
        regulationId: regulation.id,
        publicationKey: regulation.publicationKey,
      },
      relations: { options: true },
      order: { order: 'ASC', options: { order: 'ASC' } },
    });
    return { ...regulation, questions };
  }

  async getCurrentRegulationForAdmin(targetRole: 'empleada' | 'chofer' | 'jefe' = 'empleada') {
    const current = await this.getCurrentRegulation(targetRole);
    const questions = await Promise.all(
      current.questions.map(async (question) => {
        const options = await this.optionRepository
          .createQueryBuilder('option')
          .addSelect('option.isCorrect')
          .where('option.questionId = :questionId', { questionId: question.id })
          .orderBy('option.order', 'ASC')
          .getMany();
        return { ...question, options };
      }),
    );
    return { ...current, questions };
  }

  async publishRegulation(dto: PublishRegulationDto) {
    for (const [index, question] of dto.questions.entries()) {
      const correctOptions = question.options.filter(
        (option) => option.isCorrect,
      );
      if (correctOptions.length !== 1) {
        throw new BadRequestException(
          `La pregunta ${index + 1} debe tener exactamente una respuesta correcta`,
        );
      }
    }

    const publicationKey = randomUUID();
    const publishedAt = new Date();

    const targetRole = dto.targetRole || 'empleada';

    await this.dataSource.transaction(async (manager) => {
      let regulation = await manager.findOne(EmployeeRegulation, {
        where: { targetRole },
        order: { updatedAt: 'DESC' },
      });

      if (regulation) {
        regulation.title = dto.title;
        regulation.content = dto.content;
        regulation.passingScore = dto.passingScore;
        regulation.publicationKey = publicationKey;
        regulation.publishedAt = publishedAt;
        regulation.updatedAt = publishedAt;
      } else {
        regulation = manager.create(EmployeeRegulation, {
          title: dto.title,
          content: dto.content,
          passingScore: dto.passingScore,
          publicationKey,
          publishedAt,
          updatedAt: publishedAt,
          targetRole,
        });
      }
      regulation = await manager.save(EmployeeRegulation, regulation);

      for (const [questionIndex, questionDto] of dto.questions.entries()) {
        const question = await manager.save(
          RegulationQuestion,
          manager.create(RegulationQuestion, {
            regulationId: regulation.id,
            publicationKey,
            text: questionDto.text,
            order: questionIndex + 1,
          }),
        );
        await manager.save(
          RegulationOption,
          questionDto.options.map((option, optionIndex) =>
            manager.create(RegulationOption, {
              questionId: question.id,
              text: option.text,
              isCorrect: option.isCorrect,
              order: optionIndex + 1,
            }),
          ),
        );
      }

      const previousAssignments = await manager.find(EmployeeOnboarding, {
        where: { active: true },
      });
      const previousByUser = new Map(
        previousAssignments.map((assignment) => [
          assignment.userId,
          assignment,
        ]),
      );
      if (previousAssignments.length > 0) {
        await manager.update(
          EmployeeOnboarding,
          { active: true },
          { active: false },
        );
      }

      const staff = await manager.find(Usuarios, {
        where: { rol: targetRole },
      });
      const employeeProfiles =
        staff.length > 0
          ? await manager.find(Empleadas, {
              where: { usuarioId: In(staff.map((user) => user.id)) },
            })
          : [];
      const employeeByUser = new Map(
        employeeProfiles.map((employee) => [employee.usuarioId, employee]),
      );
      if (staff.length > 0) {
        await manager.save(
          EmployeeOnboarding,
          staff.map((user) => {
            const previous = previousByUser.get(user.id);
            const employee = employeeByUser.get(user.id);
            return manager.create(EmployeeOnboarding, {
              userId: user.id,
              employeeId: employee?.id ?? null,
              publicationKey,
              assignedAt: publishedAt,
              status: 'pending',
              active: true,
              isRenewal: Boolean(previous),
              attemptCount: 0,
              bestScore: 0,
              trustScore: 1,
              welcomeSentAt: previous?.welcomeSentAt ? publishedAt : null,
            });
          }),
        );
      }
    });

    return this.getCurrentRegulationForAdmin(dto.targetRole || 'empleada');
  }

  async ensureCurrentAssignmentForUser(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!user || !['empleada', 'chofer', 'jefe'].includes(user.rol)) {
      throw new NotFoundException('No se encontró un trabajador elegible');
    }
    const employee =
      user.rol === 'empleada'
        ? await this.employeeRepository.findOne({
            where: { usuarioId: userId },
          })
        : null;
    const targetRole = user.rol as 'empleada' | 'chofer' | 'jefe';
    const regulation = await this.regulationRepository.findOne({
      where: { targetRole },
      order: { updatedAt: 'DESC' },
    });
    if (!regulation) {
      throw new NotFoundException('No hay un reglamento publicado');
    }

    let assignment = await this.onboardingRepository.findOne({
      where: { userId, active: true },
    });
    if (assignment?.publicationKey === regulation.publicationKey) {
      return assignment;
    }

    assignment = await this.dataSource.transaction(async (manager) => {
      const previous = await manager.findOne(EmployeeOnboarding, {
        where: { userId, active: true },
      });
      if (previous) {
        previous.active = false;
        await manager.save(EmployeeOnboarding, previous);
      }
      return manager.save(
        EmployeeOnboarding,
        manager.create(EmployeeOnboarding, {
          userId,
          employeeId: employee?.id ?? null,
          publicationKey: regulation.publicationKey,
          assignedAt: new Date(),
          status: 'pending',
          active: true,
          isRenewal: false,
          attemptCount: 0,
          bestScore: 0,
          trustScore: 1,
          welcomeSentAt: previous?.welcomeSentAt ? new Date() : null,
        }),
      );
    });
    return assignment;
  }

  async getActiveAssignmentForUser(userId: string) {
    const assignment = await this.onboardingRepository.findOne({
      where: { userId, active: true },
      relations: { user: true, employee: true, attempts: true },
    });
    if (!assignment) throw new NotFoundException('Incorporación no encontrada');
    return assignment;
  }

  async getRegulationForAssignment(assignment: EmployeeOnboarding) {
    const regulation = await this.regulationRepository.findOne({
      where: { publicationKey: assignment.publicationKey },
    });
    if (
      !regulation ||
      regulation.publicationKey !== assignment.publicationKey
    ) {
      throw new ConflictException('El reglamento asignado ya no está vigente');
    }
    return regulation;
  }

  async startQuestionnaire(userId: string): Promise<QuestionnaireProgress> {
    const attempt = await this.dataSource.transaction(async (manager) => {
      const onboarding = await manager.findOne(EmployeeOnboarding, {
        where: { userId, active: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!onboarding)
        throw new NotFoundException('Incorporación no encontrada');
      if (onboarding.status === 'completed') {
        throw new ConflictException('El cuestionario vigente ya fue aprobado');
      }

      const existing = await manager.findOne(QuestionnaireAttempt, {
        where: { onboardingId: onboarding.id, status: 'in_progress' },
        order: { attemptNumber: 'DESC' },
      });
      if (existing) return existing;

      const totalQuestions = await manager.count(RegulationQuestion, {
        where: { publicationKey: onboarding.publicationKey },
      });
      if (totalQuestions === 0) {
        throw new ConflictException('El reglamento no tiene preguntas');
      }

      onboarding.attemptCount += 1;
      onboarding.status = 'in_progress';
      onboarding.readAt ??= new Date();
      await manager.save(EmployeeOnboarding, onboarding);
      return manager.save(
        QuestionnaireAttempt,
        manager.create(QuestionnaireAttempt, {
          onboardingId: onboarding.id,
          attemptNumber: onboarding.attemptCount,
          status: 'in_progress',
          totalQuestions,
        }),
      );
    });

    const question = await this.getNextQuestion(attempt.id);
    return { completed: false, question };
  }

  async submitAnswer(
    userId: string,
    optionId: string,
  ): Promise<QuestionnaireProgress> {
    const result = await this.dataSource.transaction(async (manager) => {
      const onboarding = await manager.findOne(EmployeeOnboarding, {
        where: { userId, active: true },
        lock: { mode: 'pessimistic_write' },
      });
      if (!onboarding)
        throw new NotFoundException('Incorporación no encontrada');
      const attempt = await manager.findOne(QuestionnaireAttempt, {
        where: { onboardingId: onboarding.id, status: 'in_progress' },
        order: { attemptNumber: 'DESC' },
      });
      if (!attempt)
        throw new ConflictException('No hay un cuestionario en progreso');

      const questions = await manager.find(RegulationQuestion, {
        where: { publicationKey: onboarding.publicationKey },
        order: { order: 'ASC' },
      });
      const answers = await manager.find(QuestionnaireAnswer, {
        where: { attemptId: attempt.id },
      });
      const answeredIds = new Set(answers.map((answer) => answer.questionId));
      const currentQuestion = questions.find(
        (question) => !answeredIds.has(question.id),
      );
      if (!currentQuestion)
        throw new ConflictException('El intento ya fue contestado');

      const option = await manager
        .getRepository(RegulationOption)
        .createQueryBuilder('option')
        .addSelect('option.isCorrect')
        .where('option.id = :optionId', { optionId })
        .andWhere('option.questionId = :questionId', {
          questionId: currentQuestion.id,
        })
        .getOne();
      if (!option) {
        throw new BadRequestException(
          'La opción no pertenece a la pregunta actual',
        );
      }

      await manager.save(
        QuestionnaireAnswer,
        manager.create(QuestionnaireAnswer, {
          attemptId: attempt.id,
          questionId: currentQuestion.id,
          optionId: option.id,
          isCorrect: option.isCorrect,
        }),
      );

      if (answers.length + 1 < questions.length) {
        return { completed: false as const, attemptId: attempt.id };
      }

      const correctAnswers =
        answers.filter((answer) => answer.isCorrect).length +
        (option.isCorrect ? 1 : 0);
      const score = Math.round((correctAnswers / questions.length) * 100);
      attempt.status = 'completed';
      attempt.correctAnswers = correctAnswers;
      attempt.totalQuestions = questions.length;
      attempt.score = score;
      attempt.completedAt = new Date();
      await manager.save(QuestionnaireAttempt, attempt);

      const regulation = await manager.findOne(EmployeeRegulation, {
        where: { publicationKey: onboarding.publicationKey },
      });
      if (!regulation) throw new NotFoundException('Reglamento no encontrado');
      onboarding.bestScore = Math.max(onboarding.bestScore, score);
      onboarding.trustScore = this.calculateTrustScore(
        onboarding.bestScore,
        onboarding.attemptCount,
      );
      const passed = score >= regulation.passingScore;
      onboarding.status = passed ? 'completed' : 'pending';
      onboarding.completedAt = passed ? new Date() : null;
      await manager.save(EmployeeOnboarding, onboarding);

      return {
        completed: true as const,
        passed,
        score,
        bestScore: onboarding.bestScore,
        trustScore: onboarding.trustScore,
        attemptCount: onboarding.attemptCount,
        passingScore: regulation.passingScore,
        correctAnswers,
        totalQuestions: questions.length,
      };
    });

    if (result.completed) return result;
    return {
      completed: false,
      question: await this.getNextQuestion(result.attemptId),
    };
  }

  calculateTrustScore(bestScore: number, attemptCount: number): number {
    const base =
      bestScore >= 90
        ? 5
        : bestScore >= 80
          ? 4
          : bestScore >= 60
            ? 3
            : bestScore >= 40
              ? 2
              : 1;
    return Math.max(1, Math.min(5, base - Math.max(0, attemptCount - 1)));
  }

  private async getNextQuestion(
    attemptId: string,
  ): Promise<RegulationQuestion> {
    const attempt = await this.attemptRepository.findOne({
      where: { id: attemptId },
      relations: { onboarding: true },
    });
    if (!attempt) throw new NotFoundException('Intento no encontrado');
    const answers = await this.answerRepository.find({ where: { attemptId } });
    const answeredIds = new Set(answers.map((answer) => answer.questionId));
    const questions = await this.questionRepository.find({
      where: { publicationKey: attempt.onboarding.publicationKey },
      relations: { options: true },
      order: { order: 'ASC', options: { order: 'ASC' } },
    });
    const question = questions.find((item) => !answeredIds.has(item.id));
    if (!question)
      throw new ConflictException('No quedan preguntas por responder');
    return question;
  }

  async findPendingDeliveries(limit = 50) {
    return this.onboardingRepository
      .createQueryBuilder('onboarding')
      .innerJoinAndSelect('onboarding.user', 'user')
      .leftJoinAndSelect('onboarding.employee', 'employee')
      .where('onboarding.active = true')
      .andWhere('user.telegramChatId IS NOT NULL')
      .andWhere(
        '(onboarding.welcomeSentAt IS NULL OR onboarding.regulationSentAt IS NULL)',
      )
      .orderBy('onboarding.assignedAt', 'ASC')
      .take(limit)
      .getMany();
  }

  async findDueReminders(cutoff: Date, limit = 50) {
    return this.onboardingRepository
      .createQueryBuilder('onboarding')
      .innerJoinAndSelect('onboarding.user', 'user')
      .leftJoinAndSelect('onboarding.employee', 'employee')
      .where('onboarding.active = true')
      .andWhere('onboarding.status = :status', { status: 'pending' })
      .andWhere('onboarding.regulationSentAt <= :cutoff', { cutoff })
      .andWhere('onboarding.reminderSentAt IS NULL')
      .andWhere('user.telegramChatId IS NOT NULL')
      .orderBy('onboarding.regulationSentAt', 'ASC')
      .take(limit)
      .getMany();
  }

  async markWelcomeSent(id: string) {
    await this.onboardingRepository.update(id, {
      welcomeSentAt: new Date(),
      lastDeliveryError: null,
    });
  }

  async markRegulationSent(id: string) {
    await this.onboardingRepository.update(id, {
      regulationSentAt: new Date(),
      lastDeliveryError: null,
    });
  }

  async markReminderSent(id: string) {
    await this.onboardingRepository.update(id, {
      reminderSentAt: new Date(),
      lastDeliveryError: null,
    });
  }

  async markDeliveryError(id: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await this.onboardingRepository.update(id, {
      lastDeliveryError: message.slice(0, 4000),
    });
  }

  async findAll() {
    const [employees, onboardings] = await Promise.all([
      this.employeeRepository.find({
        relations: { usuario: true },
        order: { createdAt: 'DESC' },
      }),
      this.onboardingRepository.find({
        where: { active: true },
        relations: { user: true, employee: true, attempts: true },
        order: { assignedAt: 'DESC', attempts: { attemptNumber: 'ASC' } },
      }),
    ]);
    const onboardingByEmployee = new Map(
      onboardings
        .filter((onboarding) => onboarding.employeeId)
        .map((onboarding) => [onboarding.employeeId, onboarding]),
    );
    return employees.map((employee) => {
      const onboarding = onboardingByEmployee.get(employee.id);
      if (!onboarding) {
        return { ...this.sanitizeEmployee(employee), onboarding: null };
      }
      const { employee: omittedEmployee, ...onboardingData } = onboarding;
      void omittedEmployee;
      return {
        ...this.sanitizeEmployee(employee),
        onboarding: onboardingData,
      };
    });
  }

  async findByEmployee(employeeId: string) {
    const onboarding = await this.onboardingRepository.findOne({
      where: { employeeId, active: true },
      relations: {
        user: true,
        employee: true,
        attempts: { answers: true },
      },
      order: { attempts: { attemptNumber: 'ASC' } },
    });
    if (!onboarding) throw new NotFoundException('Incorporación no encontrada');
    return this.sanitize(onboarding);
  }

  async requeueDelivery(employeeId: string) {
    const onboarding = await this.onboardingRepository.findOne({
      where: { employeeId, active: true },
    });
    if (!onboarding) throw new NotFoundException('Incorporación no encontrada');
    onboarding.regulationSentAt = null;
    onboarding.reminderSentAt = null;
    onboarding.lastDeliveryError = null;
    await this.onboardingRepository.save(onboarding);
    return { queued: true };
  }

  async findAllStaff() {
    const [staff, onboardings] = await Promise.all([
      this.userRepository.find({
        where: { rol: In(['empleada', 'chofer', 'jefe']) },
        relations: { empleadas: true, choferes: true },
        order: { createdAt: 'DESC' },
      }),
      this.onboardingRepository.find({
        where: { active: true },
        relations: { attempts: true },
        order: { assignedAt: 'DESC', attempts: { attemptNumber: 'ASC' } },
      }),
    ]);
    const onboardingByUser = new Map(
      onboardings.map((onboarding) => [onboarding.userId, onboarding]),
    );
    return staff.map((user) => ({
      ...this.sanitizeUser(user),
      onboarding: onboardingByUser.get(user.id) ?? null,
    }));
  }

  async findByUser(userId: string) {
    const onboarding = await this.onboardingRepository.findOne({
      where: { userId, active: true },
      relations: { user: true, employee: true, attempts: { answers: true } },
      order: { attempts: { attemptNumber: 'ASC' } },
    });
    if (!onboarding) throw new NotFoundException('Incorporación no encontrada');
    return this.sanitize(onboarding);
  }

  async findUserAttempts(userIdOrEmployeeId: string) {
    const onboardings = await this.onboardingRepository.find({
      where: [
        { userId: userIdOrEmployeeId },
        { employeeId: userIdOrEmployeeId },
      ],
      relations: {
        user: true,
        employee: true,
        attempts: {
          answers: {
            question: true,
            option: true,
          },
        },
      },
      order: {
        assignedAt: 'DESC',
        attempts: {
          attemptNumber: 'DESC',
        },
      },
    });

    if (!onboardings || onboardings.length === 0) {
      const user = await this.userRepository.findOne({
        where: [
          { id: userIdOrEmployeeId },
          { empleadas: { id: userIdOrEmployeeId } },
        ],
        relations: { empleadas: true },
      });
      if (!user) {
        throw new NotFoundException('Trabajador no encontrado');
      }
      return {
        user: this.sanitizeUser(user),
        employee: user.empleadas?.[0] ? this.sanitizeEmployee(user.empleadas[0]) : null,
        attempts: [],
      };
    }

    const mainUser = onboardings[0].user ? this.sanitizeUser(onboardings[0].user) : null;
    const mainEmployee = onboardings[0].employee ? this.sanitizeEmployee(onboardings[0].employee) : null;

    const allAttempts = onboardings.flatMap((ob) =>
      (ob.attempts || []).map((att) => ({
        id: att.id,
        onboardingId: ob.id,
        publicationKey: ob.publicationKey,
        attemptNumber: att.attemptNumber,
        status: att.status,
        correctAnswers: att.correctAnswers,
        totalQuestions: att.totalQuestions,
        score: att.score,
        startedAt: att.startedAt,
        completedAt: att.completedAt,
        answersCount: att.answers?.length || 0,
      })),
    ).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    return {
      user: mainUser,
      employee: mainEmployee,
      attempts: allAttempts,
    };
  }

  async findAttemptDetails(attemptId: string) {
    const attempt = await this.attemptRepository.findOne({
      where: { id: attemptId },
      relations: {
        onboarding: {
          user: true,
          employee: true,
        },
        answers: {
          question: {
            options: true,
          },
          option: true,
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Intento no encontrado');
    }

    const onboarding = attempt.onboarding;
    const user = onboarding?.user ? this.sanitizeUser(onboarding.user) : null;
    const employee = onboarding?.employee ? this.sanitizeEmployee(onboarding.employee) : null;

    const questionBreakdown = await Promise.all(
      (attempt.answers || []).map(async (ans) => {
        const question = ans.question;
        const selectedOption = ans.option;

        const correctOption = question?.options?.find((o) => o.isCorrect) ||
          (await this.optionRepository.findOne({
            where: { questionId: ans.questionId, isCorrect: true },
          }));

        return {
          answerId: ans.id,
          questionId: ans.questionId,
          questionText: question?.text || 'Pregunta no disponible',
          selectedOptionId: ans.optionId,
          selectedOptionText: selectedOption?.text || 'Opción seleccionada',
          isCorrect: ans.isCorrect,
          correctOptionId: correctOption?.id || null,
          correctOptionText: correctOption?.text || null,
          answeredAt: ans.answeredAt,
        };
      }),
    );

    return {
      attempt: {
        id: attempt.id,
        attemptNumber: attempt.attemptNumber,
        status: attempt.status,
        score: attempt.score,
        correctAnswers: attempt.correctAnswers,
        totalQuestions: attempt.totalQuestions,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
      },
      user,
      employee,
      answers: questionBreakdown,
    };
  }

  async requeueUserDelivery(userId: string) {
    const onboarding = await this.onboardingRepository.findOne({
      where: { userId, active: true },
    });
    if (!onboarding) throw new NotFoundException('Incorporación no encontrada');
    onboarding.regulationSentAt = null;
    onboarding.reminderSentAt = null;
    onboarding.lastDeliveryError = null;
    await this.onboardingRepository.save(onboarding);
    return { queued: true };
  }

  private sanitize(onboarding: EmployeeOnboarding) {
    const safeUser = onboarding.user
      ? this.sanitizeUser(onboarding.user)
      : undefined;
    return {
      ...onboarding,
      ...(safeUser ? { user: safeUser } : {}),
      employee: onboarding.employee
        ? this.sanitizeEmployee(onboarding.employee)
        : null,
    };
  }

  private sanitizeUser(user: Usuarios) {
    const {
      passwordHash: omittedPassword,
      telegramVerificationCode: omittedCode,
      telegramVerificationExpiresAt: omittedExpiration,
      ...safeUser
    } = user;
    void omittedPassword;
    void omittedCode;
    void omittedExpiration;
    return safeUser;
  }

  private sanitizeEmployee(employee: Empleadas) {
    if (!employee.usuario) return employee;
    const {
      passwordHash: omittedPassword,
      telegramVerificationCode: omittedCode,
      telegramVerificationExpiresAt: omittedExpiration,
      ...safeUser
    } = employee.usuario;
    void omittedPassword;
    void omittedCode;
    void omittedExpiration;
    return {
      ...employee,
      usuario: safeUser,
    };
  }
}
