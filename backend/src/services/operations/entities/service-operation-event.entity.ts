import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Servicios } from '../../entities/service.entity';
import type { ServiceOperationState } from '../service-operation-state';

@Entity('service_operation_events', { schema: 'public' })
@Index('idx_service_operation_events_service_time', ['serviceId', 'occurredAt'])
@Index('idx_service_operation_events_type_time', ['type', 'occurredAt'])
export class ServiceOperationEvent {
  @Column('uuid', {
    primary: true,
    default: () => 'gen_random_uuid()',
  })
  id: string;

  @Column('uuid', { name: 'service_id' })
  serviceId: string;

  @Column('varchar', { length: 80 })
  type: string;

  @Column('varchar', { name: 'from_state', length: 50, nullable: true })
  fromState: ServiceOperationState | null;

  @Column('varchar', { name: 'to_state', length: 50, nullable: true })
  toState: ServiceOperationState | null;

  @Column('uuid', { name: 'actor_user_id', nullable: true })
  actorUserId: string | null;

  @Column('varchar', { name: 'actor_type', length: 30, default: 'system' })
  actorType: string;

  @Column('jsonb', { default: () => "'{}'::jsonb" })
  payload: Record<string, unknown>;

  @Column('timestamp with time zone', {
    name: 'occurred_at',
    default: () => 'now()',
  })
  occurredAt: Date;

  @ManyToOne(() => Servicios, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_id', referencedColumnName: 'id' })
  service: Servicios;
}
