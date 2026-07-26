import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
} from 'typeorm';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';
import { Clientes } from '../../clients/entities/client.entity';
import { Usuarios } from '../../users/entities/user.entity';
import { LoyaltyTier } from './loyalty-tier.entity';

@Index('client_memberships_cliente_id_key', ['clienteId'], { unique: true })
@Index('idx_client_memberships_tier', ['tierId'])
@Entity('client_memberships', { schema: 'public' })
export class ClientMembership {
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

  @Column('uuid', { name: 'cliente_id', unique: true })
  @ApiProperty({
    description: 'Cliente Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  clienteId: string;

  @Column('uuid', { name: 'tier_id' })
  @ApiProperty({
    description: 'Tier Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  tierId: string;

  @Column('enum', {
    name: 'status',
    enum: ['active', 'inactive', 'suspended'],
    default: 'active',
  })
  @ApiProperty({
    description: 'Status',
    enum: ['active', 'inactive', 'suspended'],
    example: 'active',
  })
  status: 'active' | 'inactive' | 'suspended';

  @Column('enum', {
    name: 'assignment_type',
    enum: ['automatic', 'manual'],
    default: 'automatic',
  })
  @ApiProperty({
    description: 'Assignment Type',
    enum: ['automatic', 'manual'],
    example: 'automatic',
  })
  assignmentType: 'automatic' | 'manual';

  @Column('integer', { name: 'points_balance', default: () => '0' })
  @ApiProperty({ description: 'Points Balance', example: 1 })
  pointsBalance: number;

  @Column('integer', { name: 'lifetime_points', default: () => '0' })
  @ApiProperty({ description: 'Lifetime Points', example: 1 })
  lifetimePoints: number;

  @Column('numeric', {
    name: 'lifetime_spend',
    precision: 12,
    scale: 2,
    default: () => '0',
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({ description: 'Lifetime Spend', example: 0 })
  lifetimeSpend: number;

  @Column('uuid', { name: 'assigned_by_user_id', nullable: true })
  @ApiPropertyOptional({
    description: 'Assigned By User Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  assignedByUserId: string | null;

  @Column('text', { name: 'assignment_notes', nullable: true })
  @ApiPropertyOptional({ description: 'Assignment Notes', example: 'Ejemplo' })
  assignmentNotes: string | null;

  @Column('timestamp with time zone', {
    name: 'joined_at',
    default: () => 'now()',
  })
  @ApiProperty({
    description: 'Joined At',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  joinedAt: Date;

  @Column('timestamp with time zone', { name: 'assigned_at', nullable: true })
  @ApiPropertyOptional({
    description: 'Assigned At',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  assignedAt: Date | null;

  @Column('timestamp with time zone', {
    name: 'updated_at',
    default: () => 'now()',
  })
  @ApiProperty({
    description: 'Updated At',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  updatedAt: Date;

  @OneToOne(() => Clientes, (cliente) => cliente.membership, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'cliente_id', referencedColumnName: 'id' }])
  @ApiProperty({ description: 'Cliente', type: () => Clientes })
  cliente: Clientes;

  @ManyToOne(() => LoyaltyTier, (tier) => tier.memberships, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn([{ name: 'tier_id', referencedColumnName: 'id' }])
  @ApiProperty({ description: 'Tier', type: () => LoyaltyTier })
  tier: LoyaltyTier;

  @ManyToOne(() => Usuarios, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn([{ name: 'assigned_by_user_id', referencedColumnName: 'id' }])
  @ApiPropertyOptional({ description: 'Assigned By', type: () => Usuarios })
  assignedBy: Usuarios | null;
}
