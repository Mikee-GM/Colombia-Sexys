import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';
import { Empleadas } from '../../employees/entities/employee.entity';
import { Usuarios } from '../../users/entities/user.entity';
import { LiquidationPayment } from './liquidation-payment.entity';

export type LiquidationDebtStatus = 'pending' | 'paid';

@Index('idx_liquidation_debts_employee_status', ['employeeId', 'status'])
@Entity('liquidation_debts', { schema: 'public' })
export class LiquidationDebt {
  @Column('uuid', { primary: true, default: () => 'gen_random_uuid()' })
  id: string;

  @Column('uuid', { name: 'employee_id' })
  employeeId: string;

  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  amount: number;

  @Column('varchar', { length: 300 })
  description: string;

  @Column('varchar', { length: 20, default: 'pending' })
  status: LiquidationDebtStatus;

  @Column('uuid', { name: 'created_by_user_id' })
  createdByUserId: string;

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

  @Column('timestamp with time zone', { name: 'deleted_at', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => Empleadas, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'employee_id' })
  employee: Empleadas;

  @ManyToOne(() => Usuarios, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy: Usuarios;

  @OneToMany(() => LiquidationPayment, (payment) => payment.debt)
  payments: LiquidationPayment[];
}
