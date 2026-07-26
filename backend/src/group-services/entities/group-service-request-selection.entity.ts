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
import { GroupServiceRequest } from './group-service-request.entity';

@Entity('group_service_request_selections')
@Index('uq_group_request_employee', ['requestId', 'employeeId'], {
  unique: true,
})
@Index('idx_group_selection_hold', ['employeeId', 'status', 'expiresAt'])
export class GroupServiceRequestSelection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'request_id' })
  requestId: string;

  @Column('uuid', { name: 'employee_id' })
  employeeId: string;

  @Column('varchar', { length: 20, default: 'reservada' })
  status: 'seleccionada' | 'reservada' | 'liberada' | 'confirmada';

  @Column('varchar', { name: 'selected_by', length: 20 })
  selectedBy: 'cliente' | 'jefe';

  @Column('numeric', {
    name: 'hourly_rate_snapshot',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  hourlyRateSnapshot: number;

  @Column('timestamp with time zone', { name: 'expires_at' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  @ManyToOne(() => GroupServiceRequest, (request) => request.selections, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'request_id' })
  request: GroupServiceRequest;

  @ManyToOne(() => Empleadas, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'employee_id' })
  employee: Empleadas;
}
