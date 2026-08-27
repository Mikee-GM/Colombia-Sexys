import { Column, Entity } from 'typeorm';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';

@Entity('employee_cash_payments')
export class EmployeeCashPayment {
  @Column('uuid', { primary: true, default: () => 'gen_random_uuid()' })
  id: string;
  @Column('uuid', { name: 'employee_id' }) employeeId: string;
  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  amount: number;
  @Column('varchar', { length: 240, nullable: true }) note: string | null;
  @Column('uuid', { name: 'registered_by_user_id' }) registeredByUserId: string;
  @Column('varchar', { length: 20, default: 'physical' }) origin:
    'physical' | 'weekly_offset';
  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  /*
   * Un abono revertido se marca, no se borra: la empleada y la oficina revisan
   * la misma liquidacion, y una fila que desaparece sin rastro deja el saldo
   * sin explicacion. Al revertirlo se restan sus asignaciones de las
   * obligaciones, y a partir de ahi la fila solo vive en el historial.
   */
  @Column('timestamptz', { name: 'reverted_at', nullable: true })
  revertedAt: Date | null;
  @Column('uuid', { name: 'reverted_by_user_id', nullable: true })
  revertedByUserId: string | null;
  @Column('varchar', { name: 'reverted_reason', length: 240, nullable: true })
  revertedReason: string | null;
}

@Entity('employee_cash_payment_allocations')
export class EmployeeCashPaymentAllocation {
  @Column('uuid', { name: 'payment_id', primary: true }) paymentId: string;
  @Column('uuid', { name: 'obligation_id', primary: true })
  obligationId: string;
  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  amount: number;
}
