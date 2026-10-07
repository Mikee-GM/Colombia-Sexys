import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Persisted pre-service booking draft.
 *
 * TelegramSession remains the transport/session state machine for backwards
 * compatibility, but this row is the source of truth for the booking data
 * shown and edited by the boss panel. A draft is deliberately not a service:
 * the service_id is populated only after a boss accepts it.
 */
@Entity('customer_booking_sessions', { schema: 'public' })
@Index('idx_customer_booking_sessions_client_status', ['clientId', 'status'])
@Index('idx_customer_booking_sessions_employee_status', [
  'intendedEmployeeId',
  'status',
])
@Index('idx_customer_booking_sessions_updated_at', ['updatedAt'])
export class CustomerBookingSession {
  @PrimaryColumn('uuid', { name: 'id' })
  id: string;

  @Column('uuid', { name: 'client_id' })
  clientId: string;

  @Column('uuid', { name: 'intended_employee_id', nullable: true })
  intendedEmployeeId: string | null;

  @Column('uuid', { name: 'owner_boss_id', nullable: true })
  ownerBossId: string | null;

  @Column('varchar', { length: 32, default: 'COLLECTING' })
  status:
    | 'COLLECTING'
    | 'READY'
    | 'HUMAN_ACTIVE'
    | 'ACCEPTING'
    | 'SERVICE_CREATED'
    | 'CANCELLED'
    | 'ABANDONED';

  @Column('numeric', { name: 'duration_hours', nullable: true })
  durationHours: number | null;

  @Column('boolean', { name: 'open_ended_duration', default: false })
  openEndedDuration: boolean;

  @Column('varchar', { name: 'place_type', length: 24, nullable: true })
  placeType: 'preset' | 'external' | null;

  @Column('uuid', { name: 'preset_location_id', nullable: true })
  presetLocationId: string | null;

  @Column('varchar', { name: 'location_name', length: 160, nullable: true })
  locationName: string | null;

  @Column('text', { name: 'location_address', nullable: true })
  locationAddress: string | null;

  @Column('text', { name: 'location_notes', nullable: true })
  locationNotes: string | null;

  @Column('double precision', { name: 'location_lat', nullable: true })
  locationLat: number | null;

  @Column('double precision', { name: 'location_lng', nullable: true })
  locationLng: number | null;

  @Column('varchar', { name: 'room', length: 80, nullable: true })
  room: string | null;

  @Column('varchar', { name: 'payment_method', length: 24, nullable: true })
  paymentMethod: 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto' | null;

  @Column('varchar', {
    name: 'schedule_type',
    length: 24,
    default: 'inmediato',
  })
  scheduleType: 'inmediato' | 'programado';

  @Column('timestamp with time zone', { name: 'scheduled_at', nullable: true })
  scheduledAt: Date | null;

  @Column('varchar', {
    name: 'current_requirement',
    length: 48,
    nullable: true,
  })
  currentRequirement: string | null;

  @Column('varchar', { length: 16, default: 'AI_ACTIVE' })
  mode: 'AI_ACTIVE' | 'HUMAN_ACTIVE';

  @Column('uuid', { name: 'service_id', nullable: true, unique: true })
  serviceId: string | null;

  @Column('integer', { default: 1 })
  version: number;

  @Column('jsonb', { default: () => "'{}'::jsonb" })
  metadata: Record<string, unknown>;

  @Column('timestamp with time zone', {
    name: 'last_interaction_at',
    default: () => 'now()',
  })
  lastInteractionAt: Date;

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
}
