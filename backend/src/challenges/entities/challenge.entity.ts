import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Usuarios } from '../../users/entities/user.entity';
import { ChallengeParticipant } from './challenge-participant.entity';

export const CHALLENGE_PARTICIPANT_TYPES = ['employee', 'driver'] as const;
export type ChallengeParticipantType =
  (typeof CHALLENGE_PARTICIPANT_TYPES)[number];

export const CHALLENGE_METRICS = ['kpi_score', 'services', 'revenue'] as const;
export type ChallengeMetric = (typeof CHALLENGE_METRICS)[number];

export const CHALLENGE_STATUSES = [
  'scheduled',
  'active',
  'finished',
  'cancelled',
] as const;
export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number];

@Index('challenges_pkey', ['id'], { unique: true })
@Entity('challenges', { schema: 'public' })
export class Challenge {
  @Column('uuid', {
    primary: true,
    name: 'id',
    default: () => 'gen_random_uuid()',
  })
  @ApiProperty()
  id: string;

  @Column('character varying', { name: 'title', length: 160 })
  @ApiProperty()
  title: string;

  @Column('character varying', { name: 'participant_type', length: 20 })
  @ApiProperty({ enum: CHALLENGE_PARTICIPANT_TYPES })
  participantType: ChallengeParticipantType;

  @Column('character varying', { name: 'metric', length: 20 })
  @ApiProperty({ enum: CHALLENGE_METRICS })
  metric: ChallengeMetric;

  @Column('character varying', {
    name: 'status',
    length: 20,
    default: 'scheduled',
  })
  @ApiProperty({ enum: CHALLENGE_STATUSES })
  status: ChallengeStatus;

  @Column('timestamp with time zone', { name: 'starts_at' })
  @ApiProperty()
  startsAt: Date;

  @Column('timestamp with time zone', { name: 'ends_at' })
  @ApiProperty()
  endsAt: Date;

  @Column('uuid', { name: 'created_by_user_id' })
  @ApiProperty()
  createdByUserId: string;

  @Column('uuid', { name: 'winner_participant_id', nullable: true })
  @ApiPropertyOptional()
  winnerParticipantId: string | null;

  @Column('numeric', { name: 'winner_value', nullable: true })
  @ApiPropertyOptional()
  winnerValue: string | null;

  @Column('timestamp with time zone', { name: 'finished_at', nullable: true })
  @ApiPropertyOptional()
  finishedAt: Date | null;

  @Column('timestamp with time zone', { name: 'cancelled_at', nullable: true })
  @ApiPropertyOptional()
  cancelledAt: Date | null;

  @Column('timestamp with time zone', {
    name: 'created_at',
    default: () => 'now()',
  })
  @ApiProperty()
  createdAt: Date;

  @ManyToOne(() => Usuarios, { onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'created_by_user_id', referencedColumnName: 'id' }])
  @ApiProperty({ type: () => Usuarios })
  createdBy: Usuarios;

  @OneToMany(() => ChallengeParticipant, (participant) => participant.challenge)
  @ApiProperty({ type: () => [ChallengeParticipant] })
  participants: ChallengeParticipant[];
}
