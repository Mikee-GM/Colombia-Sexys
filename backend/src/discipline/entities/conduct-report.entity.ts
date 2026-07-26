import { Column, Entity, Index } from 'typeorm';
import { RATING_DIRECTIONS } from './interaction-rating.entity';
import type { RatingDirection } from './interaction-rating.entity';

export const CONDUCT_CATEGORIES = [
  'trato_inadecuado',
  'demora_impuntualidad',
  'incumplimiento',
  'cobro',
  'seguridad',
  'otro',
] as const;
export type ConductCategory = (typeof CONDUCT_CATEGORIES)[number];

@Entity('conduct_reports')
@Index(['subjectType', 'subjectId', 'createdAt'])
export class ConductReport {
  @Column('uuid', { primary: true, default: () => 'gen_random_uuid()' })
  id: string;

  @Column('enum', { enum: RATING_DIRECTIONS })
  direction: RatingDirection;

  @Column('varchar', { name: 'reporter_type', length: 20 })
  reporterType: 'client' | 'employee' | 'driver';

  @Column('uuid', { name: 'reporter_id' })
  reporterId: string;

  @Column('varchar', { name: 'subject_type', length: 20 })
  subjectType: 'client' | 'employee' | 'driver';

  @Column('uuid', { name: 'subject_id' })
  subjectId: string;

  @Column('uuid', { name: 'service_id', nullable: true })
  serviceId: string | null;

  @Column('uuid', { name: 'trip_id', nullable: true })
  tripId: string | null;

  @Column('enum', { enum: CONDUCT_CATEGORIES })
  category: ConductCategory;

  @Column('text')
  description: string;

  @Column('varchar', { default: 'normal', length: 12 })
  priority: 'normal' | 'alta' | 'urgente';

  @Column('varchar', { default: 'nuevo', length: 20 })
  status: 'nuevo' | 'en_revision' | 'cerrado';

  @Column('varchar', { nullable: true, length: 20 })
  outcome: 'confirmado' | 'no_sustentado' | null;

  @Column('uuid', { name: 'assigned_admin_id', nullable: true })
  assignedAdminId: string | null;

  @Column('text', { nullable: true })
  resolution: string | null;

  @Column('jsonb', { default: () => "'[]'::jsonb" })
  history: Array<Record<string, unknown>>;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column('timestamptz', { name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;
}
