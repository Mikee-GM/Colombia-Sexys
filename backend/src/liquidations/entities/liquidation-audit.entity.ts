import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Usuarios } from '../../users/entities/user.entity';

@Index('idx_liquidation_audit_entity', ['entityType', 'entityId'])
@Entity('liquidation_audit_log', { schema: 'public' })
export class LiquidationAudit {
  @Column('uuid', { primary: true, default: () => 'gen_random_uuid()' })
  id: string;

  @Column('varchar', { name: 'entity_type', length: 30 })
  entityType: 'record' | 'debt' | 'payment' | 'weekly_settlement';

  @Column('uuid', { name: 'entity_id' })
  entityId: string;

  @Column('varchar', { length: 30 })
  action: 'created' | 'updated' | 'deleted' | 'confirmed';

  @Column('uuid', { name: 'actor_user_id' })
  actorUserId: string;

  @Column('jsonb', { name: 'before_value', nullable: true })
  beforeValue: Record<string, unknown> | null;

  @Column('jsonb', { name: 'after_value', nullable: true })
  afterValue: Record<string, unknown> | null;

  @Column('timestamp with time zone', {
    name: 'created_at',
    default: () => 'now()',
  })
  createdAt: Date;

  @ManyToOne(() => Usuarios, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'actor_user_id' })
  actor: Usuarios;
}
