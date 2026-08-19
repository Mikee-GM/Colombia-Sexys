import { Column, Entity, Index } from 'typeorm';

export const RATING_DIRECTIONS = [
  'client_to_employee',
  'employee_to_client',
  'driver_to_employee',
  'employee_to_driver',
] as const;
export type RatingDirection = (typeof RATING_DIRECTIONS)[number];

export const RATING_APPEAL_STATUSES = [
  'none',
  'pending',
  'upheld',
  'overturned',
] as const;
export type RatingAppealStatus = (typeof RATING_APPEAL_STATUSES)[number];

@Entity('interaction_ratings')
@Index(['direction', 'serviceId', 'employeeId'], {
  unique: true,
  where: `"service_id" IS NOT NULL AND "trip_id" IS NULL`,
})
@Index(['direction', 'tripId'], {
  unique: true,
  where: `"trip_id" IS NOT NULL`,
})
export class InteractionRating {
  @Column('uuid', { primary: true, default: () => 'gen_random_uuid()' })
  id: string;

  @Column('enum', { enum: RATING_DIRECTIONS })
  direction: RatingDirection;

  @Column('uuid', { name: 'service_id', nullable: true })
  serviceId: string | null;

  @Column('uuid', { name: 'trip_id', nullable: true })
  tripId: string | null;

  @Column('uuid', { name: 'client_id', nullable: true })
  clientId: string | null;

  @Column('uuid', { name: 'employee_id', nullable: true })
  employeeId: string | null;

  @Column('uuid', { name: 'driver_id', nullable: true })
  driverId: string | null;

  @Column('smallint')
  stars: number;

  @Column('text', { nullable: true })
  comment: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column('varchar', {
    name: 'appeal_status',
    length: 20,
    default: 'none',
  })
  appealStatus: RatingAppealStatus;

  @Column('text', { name: 'appeal_reason', nullable: true })
  appealReason: string | null;

  @Column('timestamptz', { name: 'appeal_resolved_at', nullable: true })
  appealResolvedAt: Date | null;

  @Column('uuid', { name: 'appeal_resolved_by_user_id', nullable: true })
  appealResolvedByUserId: string | null;
}
