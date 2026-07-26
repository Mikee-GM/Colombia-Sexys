import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Clientes } from '../../clients/entities/client.entity';
import { Empleadas } from '../../employees/entities/employee.entity';
import { Servicios } from '../../services/entities/service.entity';
import { Usuarios } from '../../users/entities/user.entity';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';
import { GroupServiceRequestSelection } from './group-service-request-selection.entity';

export type GroupRequestStatus =
  | 'esperando_jefe'
  | 'seleccionando'
  | 'reservada'
  | 'esperando_pago'
  | 'confirmada'
  | 'vencida'
  | 'cancelada';

@Entity('group_service_requests')
@Index('idx_group_requests_boss_status', ['bossId', 'status'])
@Index('idx_group_requests_client_status', ['clientId', 'status'])
export class GroupServiceRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'client_id' })
  clientId: string;

  @Column('uuid', { name: 'boss_id' })
  bossId: string;

  @Column('uuid', { name: 'initial_employee_id', nullable: true })
  initialEmployeeId: string | null;

  @Column('uuid', { name: 'service_id', nullable: true, unique: true })
  serviceId: string | null;

  @Column('uuid', { name: 'booking_session_id', nullable: true })
  bookingSessionId: string | null;

  @Column('varchar', { length: 30, default: 'esperando_jefe' })
  status: GroupRequestStatus;

  @Column('numeric', {
    name: 'duration_hours',
    precision: 4,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  durationHours: number | null;

  @Column('varchar', { name: 'payment_method', length: 20, nullable: true })
  paymentMethod:
    | 'efectivo'
    | 'tarjeta'
    | 'transferencia'
    | 'mixto'
    | null;

  @Column('numeric', {
    name: 'location_lat',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  locationLat: number | null;

  @Column('numeric', {
    name: 'location_lng',
    precision: 10,
    scale: 7,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  locationLng: number | null;

  @Column('varchar', {
    name: 'location_reference',
    length: 240,
    nullable: true,
  })
  locationReference: string | null;

  @Column('integer', { name: 'catalog_version', default: 0 })
  catalogVersion: number;

  @Column('timestamp with time zone', {
    name: 'hold_expires_at',
    nullable: true,
  })
  holdExpiresAt: Date | null;

  @Column('boolean', { name: 'ai_active', default: false })
  aiActive: boolean;

  @Column('bigint', { name: 'telegram_thread_id', nullable: true })
  telegramThreadId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  @ManyToOne(() => Clientes, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'client_id' })
  client: Clientes;

  @ManyToOne(() => Usuarios, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'boss_id' })
  boss: Usuarios;

  @ManyToOne(() => Empleadas, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'initial_employee_id' })
  initialEmployee: Empleadas | null;

  @OneToOne(() => Servicios, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'service_id' })
  service: Servicios | null;

  @OneToMany(
    () => GroupServiceRequestSelection,
    (selection) => selection.request,
  )
  selections: GroupServiceRequestSelection[];
}
