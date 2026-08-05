import { Column, Entity, Index } from 'typeorm';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';

@Index('idx_employee_cash_obligations_employee_status', [
  'employeeId',
  'status',
  'createdAt',
])
@Entity('employee_cash_obligations')
export class EmployeeCashObligation {
  @Column('uuid', { primary: true, default: () => 'gen_random_uuid()' })
  id: string;
  @Column('uuid', { name: 'service_id', unique: true }) serviceId: string;
  @Column('uuid', { name: 'employee_id' }) employeeId: string;
  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  amount: number;
  @Column('numeric', {
    name: 'paid_amount',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  paidAmount: number;
  @Column('varchar', { length: 20, default: 'pending' }) status:
    | 'pending'
    | 'paid';
  @Column('varchar', {
    name: 'calculation_status',
    length: 20,
    default: 'provisional',
  })
  calculationStatus: 'provisional' | 'ready' | 'paid';
  @Column('varchar', { name: 'pending_reason', length: 240, nullable: true })
  pendingReason: string | null;
  @Column('numeric', {
    name: 'customer_total',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  customerTotal: number;
  @Column('numeric', {
    name: 'uber_deduction',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  uberDeduction: number;
  @Column('timestamptz', { name: 'service_date' }) serviceDate: Date;
  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt: Date;
  @Column('timestamptz', { name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;
}
