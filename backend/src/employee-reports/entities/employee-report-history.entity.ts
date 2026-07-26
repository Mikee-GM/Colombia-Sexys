import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Usuarios } from '../../users/entities/user.entity';
import { EmployeeReport } from './employee-report.entity';

@Index('idx_employee_report_history_report_created', ['reportId', 'createdAt'])
@Entity('employee_report_history')
export class EmployeeReportHistory {
  @Column('uuid', { primary: true, default: () => 'gen_random_uuid()' })
  id: string;

  @Column('uuid', { name: 'report_id' })
  reportId: string;

  @Column('uuid', { name: 'actor_user_id', nullable: true })
  actorUserId: string | null;

  @Column('varchar', { length: 40 })
  action: string;

  @Column('jsonb', { nullable: true })
  metadata: Record<string, unknown> | null;

  @Column('text', { nullable: true })
  note: string | null;

  @Column('timestamp with time zone', {
    name: 'created_at',
    default: () => 'now()',
  })
  createdAt: Date;

  @ManyToOne(() => EmployeeReport, (report) => report.history, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'report_id' })
  report: EmployeeReport;

  @ManyToOne(() => Usuarios, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_user_id' })
  actor: Usuarios | null;
}
