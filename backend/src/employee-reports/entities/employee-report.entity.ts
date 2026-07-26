import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Clientes } from '../../clients/entities/client.entity';
import { Choferes } from '../../drivers/entities/driver.entity';
import { Empleadas } from '../../employees/entities/employee.entity';
import { Servicios } from '../../services/entities/service.entity';
import { Usuarios } from '../../users/entities/user.entity';
import { EmployeeReportHistory } from './employee-report-history.entity';

export const REPORT_CATEGORIES = [
  'trato_inadecuado',
  'demora_impuntualidad',
  'incumplimiento',
  'cobro',
  'seguridad',
  'otro',
] as const;
export const REPORT_ORIGINS = ['cliente', 'chofer'] as const;
export const REPORT_PRIORITIES = ['normal', 'alta', 'urgente'] as const;
export const REPORT_STATUSES = [
  'nuevo',
  'en_revision',
  'resuelto',
  'descartado',
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];
export type ReportOrigin = (typeof REPORT_ORIGINS)[number];
export type ReportPriority = (typeof REPORT_PRIORITIES)[number];
export type ReportStatus = (typeof REPORT_STATUSES)[number];

@Index('idx_employee_reports_status_priority', ['status', 'priority'])
@Index('idx_employee_reports_employee_created', ['employeeId', 'createdAt'])
@Index('idx_employee_reports_boss_created', ['bossId', 'createdAt'])
@Index(
  'uq_employee_reports_reporter_service_category',
  ['reporterKey', 'serviceId', 'category'],
  { unique: true },
)
@Entity('employee_reports')
export class EmployeeReport {
  @Column('uuid', { primary: true, default: () => 'gen_random_uuid()' })
  @ApiProperty()
  id: string;

  @Column('uuid', { name: 'service_id' })
  serviceId: string;

  @Column('uuid', { name: 'employee_id' })
  employeeId: string;

  @Column('uuid', { name: 'boss_id' })
  bossId: string;

  @Column('enum', { enum: REPORT_ORIGINS })
  origin: ReportOrigin;

  @Column('uuid', { name: 'client_id', nullable: true })
  clientId: string | null;

  @Column('uuid', { name: 'driver_id', nullable: true })
  driverId: string | null;

  @Column('varchar', { name: 'reporter_key', length: 80 })
  reporterKey: string;

  @Column('enum', { enum: REPORT_CATEGORIES })
  category: ReportCategory;

  @Column('text')
  description: string;

  @Column('enum', { enum: REPORT_PRIORITIES, default: 'normal' })
  priority: ReportPriority;

  @Column('enum', { enum: REPORT_STATUSES, default: 'nuevo' })
  status: ReportStatus;

  @Column('uuid', { name: 'assigned_admin_id', nullable: true })
  assignedAdminId: string | null;

  @Column('text', { nullable: true })
  @ApiPropertyOptional()
  resolution: string | null;

  @Column('timestamp with time zone', { name: 'resolved_at', nullable: true })
  resolvedAt: Date | null;

  @Column('timestamp with time zone', {
    name: 'created_at',
    default: () => 'now()',
  })
  createdAt: Date;

  @Column('timestamp with time zone', {
    name: 'updated_at',
    default: () => 'now()',
  })
  updatedAt: Date;

  @ManyToOne(() => Servicios, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'service_id' })
  service: Servicios;

  @ManyToOne(() => Empleadas, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'employee_id' })
  employee: Empleadas;

  @ManyToOne(() => Usuarios, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'boss_id' })
  boss: Usuarios;

  @ManyToOne(() => Clientes, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'client_id' })
  client: Clientes | null;

  @ManyToOne(() => Choferes, { nullable: true, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'driver_id' })
  driver: Choferes | null;

  @ManyToOne(() => Usuarios, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_admin_id' })
  assignedAdmin: Usuarios | null;

  @OneToMany(() => EmployeeReportHistory, (history) => history.report)
  history: EmployeeReportHistory[];
}
