import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Challenge } from './challenge.entity';

@Index('challenge_participants_pkey', ['id'], { unique: true })
@Index(
  'challenge_participants_challenge_participant_key',
  ['challengeId', 'participantId'],
  { unique: true },
)
@Entity('challenge_participants', { schema: 'public' })
export class ChallengeParticipant {
  @Column('uuid', {
    primary: true,
    name: 'id',
    default: () => 'gen_random_uuid()',
  })
  @ApiProperty()
  id: string;

  @Column('uuid', { name: 'challenge_id' })
  @ApiProperty()
  challengeId: string;

  @Column('uuid', { name: 'participant_id' })
  @ApiProperty()
  participantId: string;

  @Column('timestamp with time zone', {
    name: 'created_at',
    default: () => 'now()',
  })
  @ApiProperty()
  createdAt: Date;

  @ManyToOne(() => Challenge, (challenge) => challenge.participants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'challenge_id', referencedColumnName: 'id' }])
  challenge: Challenge;
}
