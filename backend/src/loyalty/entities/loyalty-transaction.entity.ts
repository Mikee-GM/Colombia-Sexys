import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Clientes } from '../../clients/entities/client.entity';
import { Servicios } from '../../services/entities/service.entity';
import { Usuarios } from '../../users/entities/user.entity';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';

@Index('idx_loyalty_transactions_cliente', ['clienteId'])
@Index('idx_loyalty_transactions_servicio', ['servicioId'])
@Index('idx_loyalty_transactions_created_at', ['createdAt'])
@Index('loyalty_transactions_service_type_key', ['servicioId', 'type'], {
  unique: true,
})
@Entity('loyalty_transactions', { schema: 'public' })
export class LoyaltyTransaction {
  @Column('uuid', {
    primary: true,
    name: 'id',
    default: () => 'gen_random_uuid()',
  })
  @ApiProperty({
    description: 'Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  id: string;

  @Column('uuid', { name: 'cliente_id' })
  @ApiProperty({
    description: 'Cliente Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  clienteId: string;

  @Column('uuid', { name: 'servicio_id', nullable: true })
  @ApiPropertyOptional({
    description: 'Servicio Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  servicioId: string | null;

  @Column('uuid', { name: 'created_by_user_id', nullable: true })
  @ApiPropertyOptional({
    description: 'Created By User Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  createdByUserId: string | null;

  @Column('enum', {
    name: 'type',
    enum: ['earned', 'manual_adjustment', 'tier_assignment', 'reversal'],
  })
  @ApiProperty({
    description: 'Type',
    enum: ['earned', 'manual_adjustment', 'tier_assignment', 'reversal'],
    example: 'earned',
  })
  type: 'earned' | 'manual_adjustment' | 'tier_assignment' | 'reversal';

  @Column('integer', { name: 'points' })
  @ApiProperty({ description: 'Points', example: 1 })
  points: number;

  @Column('numeric', {
    name: 'amount_basis',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  @ApiPropertyOptional({ description: 'Amount Basis', example: 1200.0 })
  amountBasis: number | null;

  @Column('text', { name: 'description', nullable: true })
  @ApiPropertyOptional({ description: 'Description', example: 'Ejemplo' })
  description: string | null;

  @Column('timestamp with time zone', {
    name: 'created_at',
    default: () => 'now()',
  })
  @ApiProperty({
    description: 'Created At',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  createdAt: Date;

  @ManyToOne(() => Clientes, (cliente) => cliente.loyaltyTransactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'cliente_id', referencedColumnName: 'id' }])
  @ApiProperty({ description: 'Cliente', type: () => Clientes })
  cliente: Clientes;

  @ManyToOne(() => Servicios, (servicio) => servicio.loyaltyTransactions, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn([{ name: 'servicio_id', referencedColumnName: 'id' }])
  @ApiPropertyOptional({ description: 'Servicio', type: () => Servicios })
  servicio: Servicios | null;

  @ManyToOne(() => Usuarios, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn([{ name: 'created_by_user_id', referencedColumnName: 'id' }])
  @ApiPropertyOptional({ description: 'Created By', type: () => Usuarios })
  createdBy: Usuarios | null;
}
