import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { CandidateScreening } from './candidate-screening.entity';

@Index('candidate_screening_answers_pkey', ['id'], { unique: true })
@Index(
  'candidate_screening_answers_screening_question_key',
  ['screeningId', 'questionId'],
  { unique: true },
)
@Entity('candidate_screening_answers', { schema: 'public' })
export class CandidateScreeningAnswer {
  @Column('uuid', {
    primary: true,
    name: 'id',
    default: () => 'gen_random_uuid()',
  })
  @ApiProperty()
  id: string;

  @Column('uuid', { name: 'screening_id' })
  @ApiProperty()
  screeningId: string;

  @Column('uuid', { name: 'question_id' })
  @ApiProperty()
  questionId: string;

  /** Snapshot del texto de la pregunta al momento de responder. */
  @Column('text', { name: 'question_text' })
  @ApiProperty()
  questionText: string;

  @Column('text', { name: 'answer_text' })
  @ApiProperty()
  answerText: string;

  @Column('timestamp with time zone', {
    name: 'answered_at',
    default: () => 'now()',
  })
  @ApiProperty()
  answeredAt: Date;

  @ManyToOne(() => CandidateScreening, (screening) => screening.answers, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'screening_id', referencedColumnName: 'id' }])
  screening: CandidateScreening;
}
