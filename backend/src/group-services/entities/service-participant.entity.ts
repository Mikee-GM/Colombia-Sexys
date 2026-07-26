import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';
import { Empleadas } from '../../employees/entities/employee.entity';
import { Servicios } from '../../services/entities/service.entity';

export type ParticipantStatus =
  | 'reservada'
  | 'pendiente_pago'
  | 'activa'
  | 'retirada'
  | 'cancelada';

@Entity('service_participants')
@Index('uq_service_participant', ['serviceId', 'employeeId'], { unique: true })
@Index('idx_participant_employee_status', ['employeeId', 'status'])
export class ServiceParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'service_id' })
  serviceId: string;

  @Column('uuid', { name: 'employee_id' })
  employeeId: string;

  @Column('varchar', { length: 20, default: 'participante' })
  role: 'responsable' | 'participante';

  @Column('varchar', { length: 20, default: 'reservada' })
  status: ParticipantStatus;

  @Column('numeric', {
    name: 'hourly_rate_snapshot',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  hourlyRateSnapshot: number;

  @Column('numeric', {
    name: 'billable_hours',
    precision: 4,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  billableHours: number;

  @Column('numeric', {
    name: 'confirmed_subtotal',
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  confirmedSubtotal: number;

  @Column('timestamp with time zone', { name: 'hold_expires_at', nullable: true })
  holdExpiresAt: Date | null;

  @Column('timestamp with time zone', { name: 'joined_at', nullable: true })
  joinedAt: Date | null;

  @Column('timestamp with time zone', { name: 'removed_at', nullable: true })
  removedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  @ManyToOne(() => Servicios, (service) => service.participantes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'service_id' })
  service: Servicios;

  @ManyToOne(() => Empleadas, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'employee_id' })
  employee: Empleadas;
}
