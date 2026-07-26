import { Column, Entity, Index } from 'typeorm';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';

@Index(['employeeId', 'weekStart'], { unique: true })
@Entity('employee_weekly_settlements')
export class EmployeeWeeklySettlement {
  @Column('uuid', { primary: true, default: () => 'gen_random_uuid()' })
  id: string;
  @Column('uuid', { name: 'employee_id' }) employeeId: string;
  @Column('date', { name: 'week_start' }) weekStart: string;
  @Column('date', { name: 'week_end' }) weekEnd: string;
  @Column('numeric', {
    name: 'gross_employee_pay',
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  grossEmployeePay: number;
  @Column('numeric', {
    name: 'cash_offset',
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  cashOffset: number;
  @Column('numeric', {
    name: 'net_employee_pay',
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  netEmployeePay: number;
  @Column('numeric', {
    name: 'remaining_cash_debt',
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  remainingCashDebt: number;
  @Column('uuid', { name: 'confirmed_by_user_id' }) confirmedByUserId: string;
  @Column('timestamptz', { name: 'confirmed_at', default: () => 'now()' })
  confirmedAt: Date;
}
