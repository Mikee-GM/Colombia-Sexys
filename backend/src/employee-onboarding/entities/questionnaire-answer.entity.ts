import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { QuestionnaireAttempt } from './questionnaire-attempt.entity';
import { RegulationQuestion } from './regulation-question.entity';
import { RegulationOption } from './regulation-option.entity';

@Index('questionnaire_answers_pkey', ['id'], { unique: true })
@Index(
  'questionnaire_answers_attempt_question_key',
  ['attemptId', 'questionId'],
  {
    unique: true,
  },
)
@Entity('questionnaire_answers', { schema: 'public' })
export class QuestionnaireAnswer {
  @Column('uuid', {
    primary: true,
    name: 'id',
    default: () => 'gen_random_uuid()',
  })
  id: string;

  @Column('uuid', { name: 'attempt_id' })
  attemptId: string;

  @Column('uuid', { name: 'question_id' })
  questionId: string;

  @Column('uuid', { name: 'option_id' })
  optionId: string;

  @Column('boolean', { name: 'is_correct' })
  isCorrect: boolean;

  @Column('timestamp with time zone', {
    name: 'answered_at',
    default: () => 'now()',
  })
  answeredAt: Date;

  @ManyToOne(() => QuestionnaireAttempt, (attempt) => attempt.answers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'attempt_id', referencedColumnName: 'id' }])
  attempt: QuestionnaireAttempt;

  @ManyToOne(() => RegulationQuestion, { onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'question_id', referencedColumnName: 'id' }])
  question: RegulationQuestion;

  @ManyToOne(() => RegulationOption, { onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'option_id', referencedColumnName: 'id' }])
  option: RegulationOption;
}
