import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { EmployeeRegulation } from './employee-regulation.entity';
import { RegulationOption } from './regulation-option.entity';

@Index('regulation_questions_pkey', ['id'], { unique: true })
@Index('idx_regulation_questions_publication', [
  'regulationId',
  'publicationKey',
  'order',
])
@Entity('regulation_questions', { schema: 'public' })
export class RegulationQuestion {
  @Column('uuid', {
    primary: true,
    name: 'id',
    default: () => 'gen_random_uuid()',
  })
  id: string;

  @Column('uuid', { name: 'regulation_id' })
  regulationId: string;

  @Column('uuid', { name: 'publication_key' })
  publicationKey: string;

  @Column('text', { name: 'text' })
  text: string;

  @Column('smallint', { name: 'display_order' })
  order: number;

  @ManyToOne(() => EmployeeRegulation, (regulation) => regulation.questions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'regulation_id', referencedColumnName: 'id' }])
  regulation: EmployeeRegulation;

  @OneToMany(() => RegulationOption, (option) => option.question)
  options: RegulationOption[];
}
