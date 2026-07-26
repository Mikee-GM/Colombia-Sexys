import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Empleadas } from '../../employees/entities/employee.entity';
import { Usuarios } from '../../users/entities/user.entity';
import { QuestionnaireAttempt } from './questionnaire-attempt.entity';

export type QuestionnaireStatus = 'pending' | 'in_progress' | 'completed';

@Index('employee_onboardings_pkey', ['id'], { unique: true })
@Index('idx_employee_onboardings_employee', ['employeeId'])
@Index('idx_employee_onboardings_user', ['userId'])
@Index('idx_employee_onboardings_pending', ['active', 'status', 'assignedAt'])
@Entity('employee_onboardings', { schema: 'public' })
export class EmployeeOnboarding {
  @Column('uuid', {
    primary: true,
    name: 'id',
    default: () => 'gen_random_uuid()',
  })
  @ApiProperty()
  id: string;

  @Column('uuid', { name: 'user_id' })
  @ApiProperty()
  userId: string;

  @Column('uuid', { name: 'employee_id', nullable: true })
  @ApiPropertyOptional()
  employeeId: string | null;

  @Column('uuid', { name: 'publication_key' })
  publicationKey: string;

  @Column('enum', {
    name: 'status',
    enum: ['pending', 'in_progress', 'completed'],
    default: 'pending',
  })
  @ApiProperty({ enum: ['pending', 'in_progress', 'completed'] })
  status: QuestionnaireStatus;

  @Column('boolean', { name: 'active', default: true })
  active: boolean;

  @Column('boolean', { name: 'is_renewal', default: false })
  isRenewal: boolean;

  @Column('smallint', { name: 'attempt_count', default: 0 })
  @ApiProperty()
  attemptCount: number;

  @Column('smallint', { name: 'best_score', default: 0 })
  @ApiProperty()
  bestScore: number;

  @Column('smallint', { name: 'trust_score', default: 1 })
  @ApiProperty({ minimum: 1, maximum: 5 })
  trustScore: number;

  @Column('timestamp with time zone', {
    name: 'assigned_at',
    default: () => 'now()',
  })
  assignedAt: Date;

  @Column('timestamp with time zone', {
    name: 'welcome_sent_at',
    nullable: true,
  })
  @ApiPropertyOptional()
  welcomeSentAt: Date | null;

  @Column('timestamp with time zone', {
    name: 'regulation_sent_at',
    nullable: true,
  })
  @ApiPropertyOptional()
  regulationSentAt: Date | null;

  @Column('timestamp with time zone', { name: 'read_at', nullable: true })
  readAt: Date | null;

  @Column('timestamp with time zone', {
    name: 'reminder_sent_at',
    nullable: true,
  })
  reminderSentAt: Date | null;

  @Column('timestamp with time zone', { name: 'completed_at', nullable: true })
  @ApiPropertyOptional()
  completedAt: Date | null;

  @Column('text', { name: 'last_delivery_error', nullable: true })
  lastDeliveryError: string | null;

  @ManyToOne(() => Usuarios, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'user_id', referencedColumnName: 'id' }])
  user: Usuarios;

  @ManyToOne(() => Empleadas, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn([{ name: 'employee_id', referencedColumnName: 'id' }])
  employee: Empleadas | null;

  @OneToMany(() => QuestionnaireAttempt, (attempt) => attempt.onboarding)
  attempts: QuestionnaireAttempt[];
}
