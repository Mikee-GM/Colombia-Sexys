import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { EmployeeOnboarding } from './employee-onboarding.entity';
import { QuestionnaireAnswer } from './questionnaire-answer.entity';

@Index('questionnaire_attempts_pkey', ['id'], { unique: true })
@Index(
  'questionnaire_attempts_onboarding_number_key',
  ['onboardingId', 'attemptNumber'],
  { unique: true },
)
@Entity('questionnaire_attempts', { schema: 'public' })
export class QuestionnaireAttempt {
  @Column('uuid', {
    primary: true,
    name: 'id',
    default: () => 'gen_random_uuid()',
  })
  id: string;

  @Column('uuid', { name: 'onboarding_id' })
  onboardingId: string;

  @Column('smallint', { name: 'attempt_number' })
  attemptNumber: number;

  @Column('enum', {
    name: 'status',
    enum: ['in_progress', 'completed'],
    default: 'in_progress',
  })
  status: 'in_progress' | 'completed';

  @Column('smallint', { name: 'correct_answers', default: 0 })
  correctAnswers: number;

  @Column('smallint', { name: 'total_questions', default: 0 })
  totalQuestions: number;

  @Column('smallint', { name: 'score', default: 0 })
  score: number;

  @Column('timestamp with time zone', {
    name: 'started_at',
    default: () => 'now()',
  })
  startedAt: Date;

  @Column('timestamp with time zone', { name: 'completed_at', nullable: true })
  completedAt: Date | null;

  @ManyToOne(() => EmployeeOnboarding, (onboarding) => onboarding.attempts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'onboarding_id', referencedColumnName: 'id' }])
  onboarding: EmployeeOnboarding;

  @OneToMany(() => QuestionnaireAnswer, (answer) => answer.attempt)
  answers: QuestionnaireAnswer[];
}
