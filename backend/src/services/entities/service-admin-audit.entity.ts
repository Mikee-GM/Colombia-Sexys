import { Column, Entity, Index } from 'typeorm';

@Entity('service_admin_audit', { schema: 'public' })
@Index('idx_service_admin_audit_service_created', ['serviceId', 'createdAt'])
export class ServiceAdminAudit {
  @Column('uuid', { primary: true, default: () => 'gen_random_uuid()' })
  id: string;

  /** Sin FK a proposito: la auditoria debe sobrevivir al hard delete. */
  @Column('uuid', { name: 'service_id' })
  serviceId: string;

  @Column('varchar', { length: 40 })
  action: 'cancelled' | 'voided' | 'soft_deleted' | 'restored' | 'hard_deleted';

  @Column('uuid', { name: 'actor_id' })
  actorId: string;

  @Column('varchar', { name: 'actor_role', length: 20 })
  actorRole: string;

  @Column('text')
  reason: string;

  @Column('varchar', { name: 'previous_state', length: 40, nullable: true })
  previousState: string | null;

  @Column('varchar', {
    name: 'previous_operational_state',
    length: 60,
    nullable: true,
  })
  previousOperationalState: string | null;

  @Column('jsonb', { name: 'financial_snapshot' })
  financialSnapshot: Record<string, unknown>;

  @Column('jsonb', { name: 'affected_dependencies' })
  affectedDependencies: Record<string, unknown>;

  @Column('jsonb')
  result: Record<string, unknown>;

  @Column('timestamp with time zone', {
    name: 'created_at',
    default: () => 'now()',
  })
  createdAt: Date;
}
