import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';
import { PaymentReceiptValidations } from '../../services/entities/payment-receipt-validation.entity';
import { Servicios } from '../../services/entities/service.entity';
import { Usuarios } from '../../users/entities/user.entity';

@Entity('service_payments')
@Index('uq_service_payment_fingerprint', ['fingerprint'], {
  unique: true,
  where: '"fingerprint" IS NOT NULL',
})
export class ServicePayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'service_id' })
  serviceId: string;

  @Column('uuid', { name: 'receipt_validation_id', nullable: true })
  receiptValidationId: string | null;

  @Column('uuid', { name: 'approved_by_user_id', nullable: true })
  approvedByUserId: string | null;

  @Column('numeric', {
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  amount: number;

  @Column('varchar', { length: 20, default: 'pendiente' })
  status: 'pendiente' | 'aprobado' | 'rechazado';

  @Column('varchar', { length: 180, nullable: true })
  fingerprint: string | null;

  @Column('varchar', { length: 300, nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @ManyToOne(() => Servicios, (service) => service.pagos, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'service_id' })
  service: Servicios;

  @ManyToOne(() => PaymentReceiptValidations, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'receipt_validation_id' })
  receiptValidation: PaymentReceiptValidations | null;

  @ManyToOne(() => Usuarios, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'approved_by_user_id' })
  approvedBy: Usuarios | null;
}
