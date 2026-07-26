import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';
import { Usuarios } from '../../users/entities/user.entity';
import { LiquidationDebt } from './liquidation-debt.entity';

@Index('idx_liquidation_payments_debt_created', ['debtId', 'createdAt'])
@Entity('liquidation_payments', { schema: 'public' })
export class LiquidationPayment {
  @Column('uuid', { primary: true, default: () => 'gen_random_uuid()' })
  id: string;

  @Column('uuid', { name: 'debt_id' })
  debtId: string;

  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  amount: number;

  @Column('varchar', { nullable: true, length: 300 })
  note: string | null;

  @Column('uuid', { name: 'created_by_user_id' })
  createdByUserId: string;

  @Column('timestamp with time zone', {
    name: 'created_at',
    default: () => 'now()',
  })
  createdAt: Date;

  @Column('timestamp with time zone', { name: 'deleted_at', nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => LiquidationDebt, (debt) => debt.payments, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'debt_id' })
  debt: LiquidationDebt;

  @ManyToOne(() => Usuarios, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by_user_id' })
  createdBy: Usuarios;
}
