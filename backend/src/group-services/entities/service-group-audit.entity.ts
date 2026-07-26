import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { GroupServiceRequest } from './group-service-request.entity';
import { Servicios } from '../../services/entities/service.entity';
import { Usuarios } from '../../users/entities/user.entity';

@Entity('service_group_audit')
@Index('idx_group_audit_service_created', ['serviceId', 'createdAt'])
@Index('idx_group_audit_request_created', ['requestId', 'createdAt'])
export class ServiceGroupAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'service_id', nullable: true })
  serviceId: string | null;

  @Column('uuid', { name: 'request_id', nullable: true })
  requestId: string | null;

  @Column('uuid', { name: 'actor_user_id', nullable: true })
  actorUserId: string | null;

  @Column('varchar', { length: 40 })
  action: string;

  @Column('jsonb', { nullable: true })
  before: Record<string, unknown> | null;

  @Column('jsonb', { nullable: true })
  after: Record<string, unknown> | null;

  @Column('varchar', { length: 300, nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @ManyToOne(() => Servicios, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'service_id' })
  service: Servicios | null;

  @ManyToOne(() => GroupServiceRequest, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  @JoinColumn({ name: 'request_id' })
  request: GroupServiceRequest | null;

  @ManyToOne(() => Usuarios, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'actor_user_id' })
  actor: Usuarios | null;
}
