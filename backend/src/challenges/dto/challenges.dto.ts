import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  CHALLENGE_METRICS,
  CHALLENGE_PARTICIPANT_TYPES,
  ChallengeMetric,
  ChallengeParticipantType,
} from '../entities/challenge.entity';

export class CreateChallengeDto {
  @IsString() @MinLength(3) @MaxLength(160) title: string;

  @IsIn(CHALLENGE_PARTICIPANT_TYPES)
  participantType: ChallengeParticipantType;

  @IsIn(CHALLENGE_METRICS)
  metric: ChallengeMetric;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  participantIds: string[];

  @IsOptional() @IsDateString() startsAt?: string;

  @IsDateString() endsAt: string;
}
