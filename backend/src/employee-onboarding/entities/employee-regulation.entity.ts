import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { RegulationQuestion } from './regulation-question.entity';

@Index('employee_regulations_pkey', ['id'], { unique: true })
@Entity('employee_regulations', { schema: 'public' })
export class EmployeeRegulation {
  @Column('uuid', {
    primary: true,
    name: 'id',
    default: () => 'gen_random_uuid()',
  })
  @ApiProperty()
  id: string;

  @Column('enum', {
    name: 'target_role',
    enum: ['empleada', 'chofer', 'jefe'],
    default: 'empleada',
  })
  @ApiProperty({ enum: ['empleada', 'chofer', 'jefe'] })
  targetRole: 'empleada' | 'chofer' | 'jefe';

  @Column('character varying', { name: 'title', length: 255 })
  @ApiProperty()
  title: string;

  @Column('text', { name: 'content' })
  @ApiProperty()
  content: string;

  @Column('smallint', { name: 'passing_score', default: 80 })
  @ApiProperty({ example: 80 })
  passingScore: number;

  /** Identificador técnico del conjunto publicado; no es una versión visible. */
  @Column('uuid', { name: 'publication_key' })
  publicationKey: string;

  @Column('timestamp with time zone', {
    name: 'published_at',
    default: () => 'now()',
  })
  @ApiProperty()
  publishedAt: Date;

  @Column('timestamp with time zone', {
    name: 'updated_at',
    default: () => 'now()',
  })
  @ApiProperty()
  updatedAt: Date;

  @OneToMany(() => RegulationQuestion, (question) => question.regulation)
  questions: RegulationQuestion[];
}
