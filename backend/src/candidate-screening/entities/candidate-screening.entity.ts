import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Usuarios } from '../../users/entities/user.entity';
import { Empleadas } from '../../employees/entities/employee.entity';
import { CandidateScreeningAnswer } from './candidate-screening-answer.entity';

export type CandidateScreeningStatus =
  'pendiente' | 'en_progreso' | 'completado';

@Index('candidate_screenings_pkey', ['id'], { unique: true })
@Index('candidate_screenings_token_key', ['token'], { unique: true })
@Entity('candidate_screenings', { schema: 'public' })
export class CandidateScreening {
  @Column('uuid', {
    primary: true,
    name: 'id',
    default: () => 'gen_random_uuid()',
  })
  @ApiProperty()
  id: string;

  @Column('character varying', { name: 'candidate_name', length: 255 })
  @ApiProperty()
  candidateName: string;

  @Column('character varying', {
    name: 'candidate_phone',
    length: 30,
    nullable: true,
  })
  @ApiPropertyOptional()
  candidatePhone: string | null;

  @Column('character varying', { name: 'token', length: 64 })
  @ApiProperty()
  token: string;

  @Column('character varying', {
    name: 'telegram_chat_id',
    length: 64,
    nullable: true,
  })
  @ApiPropertyOptional()
  telegramChatId: string | null;

  @Column('enum', {
    name: 'status',
    enum: ['pendiente', 'en_progreso', 'completado'],
    default: 'pendiente',
  })
  @ApiProperty({ enum: ['pendiente', 'en_progreso', 'completado'] })
  status: CandidateScreeningStatus;

  /** Snapshot ordenado de los ids del banco elegidos al crear la evaluación. */
  @Column('jsonb', { name: 'question_ids', default: () => "'[]'::jsonb" })
  @ApiProperty({ type: [String] })
  questionIds: string[];

  @Column('uuid', { name: 'created_by_user_id' })
  @ApiProperty()
  createdByUserId: string;

  @Column('timestamp with time zone', {
    name: 'created_at',
    default: () => 'now()',
  })
  @ApiProperty()
  createdAt: Date;

  @Column('timestamp with time zone', { name: 'started_at', nullable: true })
  @ApiPropertyOptional()
  startedAt: Date | null;

  @Column('timestamp with time zone', { name: 'completed_at', nullable: true })
  @ApiPropertyOptional()
  completedAt: Date | null;

  @Column('uuid', { name: 'promoted_employee_id', nullable: true })
  @ApiPropertyOptional()
  promotedEmployeeId: string | null;

  @ManyToOne(() => Usuarios, { onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'created_by_user_id', referencedColumnName: 'id' }])
  @ApiProperty({ type: () => Usuarios })
  createdBy: Usuarios;

  @ManyToOne(() => Empleadas, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn([{ name: 'promoted_employee_id', referencedColumnName: 'id' }])
  @ApiPropertyOptional({ type: () => Empleadas })
  promotedEmployee: Empleadas | null;

  @OneToMany(() => CandidateScreeningAnswer, (answer) => answer.screening)
  @ApiProperty({ type: () => [CandidateScreeningAnswer] })
  answers: CandidateScreeningAnswer[];
}
