import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';
import { Empleadas } from '../../employees/entities/employee.entity';
import { Usuarios } from '../../users/entities/user.entity';
import { Servicios } from '../../services/entities/service.entity';

export const LIQUIDATION_SOURCE_ROLES = ['admin', 'jefe', 'empleada'] as const;
export type LiquidationSourceRole = (typeof LIQUIDATION_SOURCE_ROLES)[number];

export const LIQUIDATION_PAYMENT_METHODS = [
  'efectivo',
  'tarjeta',
  'transferencia',
  'mixto',
  'membresia',
] as const;
export type LiquidationPaymentMethod =
  (typeof LIQUIDATION_PAYMENT_METHODS)[number];

@Index('idx_liquidation_records_employee_date', ['employeeId', 'occurredAt'])
@Index('idx_liquidation_records_occurred_at', ['occurredAt'])
@Entity('liquidation_records', { schema: 'public' })
export class LiquidationRecord {
  @Column('uuid', {
    primary: true,
    default: () => 'gen_random_uuid()',
  })
  id: string;

  @Column('uuid', { name: 'service_id', nullable: true })
  serviceId: string | null;

  @Column('uuid', { name: 'employee_id' })
  employeeId: string;

  @Column('uuid', { name: 'registered_by_user_id' })
  registeredByUserId: string;

  @Column('varchar', { name: 'source_role', length: 20 })
  sourceRole: LiquidationSourceRole;

  @Column('timestamp with time zone', { name: 'occurred_at' })
  occurredAt: Date;

  @Column('numeric', {
    name: 'service_total',
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  serviceTotal: number;

  @Column('varchar', { name: 'payment_method', length: 20 })
  paymentMethod: LiquidationPaymentMethod;

  @Column('numeric', {
    name: 'cash_amount',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  cashAmount: number;

  @Column('jsonb', { name: 'card_amounts', default: () => "'[]'::jsonb" })
  cardAmounts: number[];

  @Column('numeric', {
    name: 'company_percentage',
    precision: 5,
    scale: 2,
    default: 40,
    transformer: new ColumnNumericTransformer(),
  })
  companyPercentage: number;

  @Column('numeric', {
    name: 'extra_amount',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  extraAmount: number;

  @Column('boolean', { default: false })
  promotion: boolean;

  @Column('numeric', {
    name: 'membership_amount',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  membershipAmount: number;

  @Column('numeric', {
    name: 'company_transport_expense',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  companyTransportExpense: number;

  @Column('numeric', {
    name: 'customer_transport_charge',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  customerTransportCharge: number;

  @Column('numeric', {
    name: 'employee_uber_reimbursement',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  employeeUberReimbursement: number;

  @Column('numeric', {
    name: 'employee_cash_due',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  employeeCashDue: number;

  @Column('numeric', {
    name: 'electronic_extra_amount',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  electronicExtraAmount: number;

  @Column('numeric', {
    name: 'transport_excess',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  transportExcess: number;

  @Column('varchar', { nullable: true, length: 120 })
  place: string | null;

  @Column('boolean', { name: 'has_outbound_driver', default: false })
  hasOutboundDriver: boolean;

  @Column('boolean', { name: 'has_return_driver', default: false })
  hasReturnDriver: boolean;

  @Column('boolean', { default: false })
  cancelled: boolean;

  @Column('boolean', { name: 'is_fine', default: false })
  isFine: boolean;

  @Column('numeric', {
    name: 'fine_amount',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  fineAmount: number;

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

  @ManyToOne(() => Empleadas, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'employee_id' })
  employee: Empleadas;

  @ManyToOne(() => Usuarios, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'registered_by_user_id' })
  registeredBy: Usuarios;

  @ManyToOne(() => Servicios, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'service_id' })
  service: Servicios | null;
}
