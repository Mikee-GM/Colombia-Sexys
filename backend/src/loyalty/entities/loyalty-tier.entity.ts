import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, OneToMany } from 'typeorm';
import { ClientMembership } from './client-membership.entity';

import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';

@Index('loyalty_tiers_code_key', ['code'], { unique: true })
@Index('idx_loyalty_tiers_active_min_spend', ['active', 'minSpend'])
@Entity('loyalty_tiers', { schema: 'public' })
export class LoyaltyTier {
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

  @Column('character varying', { name: 'code', unique: true, length: 50 })
  @ApiProperty({ description: 'Code', example: 'Ejemplo' })
  code: string;

  @Column('character varying', { name: 'name', length: 120 })
  @ApiProperty({ description: 'Name', example: 'Ejemplo' })
  name: string;

  @Column('numeric', {
    name: 'min_spend',
    precision: 12,
    scale: 2,
    default: () => '0',
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({ description: 'Min Spend', example: 0 })
  minSpend: number;

  @Column('numeric', {
    name: 'earn_rate',
    precision: 10,
    scale: 4,
    default: () => '0.1000',
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({ description: 'Earn Rate', example: 0.1 })
  earnRate: number;

  @Column('boolean', { name: 'active', default: () => 'true' })
  @ApiProperty({ description: 'Active', example: true })
  active: boolean;

  @Column('integer', { name: 'sort_order', default: () => '0' })
  @ApiProperty({ description: 'Sort Order', example: 1 })
  sortOrder: number;

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

  @OneToMany(() => ClientMembership, (membership) => membership.tier)
  @ApiProperty({
    description: 'Memberships',
    type: () => [ClientMembership],
    example: [],
  })
  memberships: ClientMembership[];
}
