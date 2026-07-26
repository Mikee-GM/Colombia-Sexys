import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { RegulationQuestion } from './regulation-question.entity';

@Index('regulation_options_pkey', ['id'], { unique: true })
@Index('idx_regulation_options_question', ['questionId', 'order'])
@Entity('regulation_options', { schema: 'public' })
export class RegulationOption {
  @Column('uuid', {
    primary: true,
    name: 'id',
    default: () => 'gen_random_uuid()',
  })
  id: string;

  @Column('uuid', { name: 'question_id' })
  questionId: string;

  @Column('text', { name: 'text' })
  text: string;

  @Column('boolean', { name: 'is_correct', default: false, select: false })
  isCorrect: boolean;

  @Column('smallint', { name: 'display_order' })
  order: number;

  @ManyToOne(() => RegulationQuestion, (question) => question.options, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'question_id', referencedColumnName: 'id' }])
  question: RegulationQuestion;
}
