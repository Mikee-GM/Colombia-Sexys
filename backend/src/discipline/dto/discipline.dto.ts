import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { RATING_DIRECTIONS } from '../entities/interaction-rating.entity';
import type { RatingDirection } from '../entities/interaction-rating.entity';
import { CONDUCT_CATEGORIES } from '../entities/conduct-report.entity';
import type { ConductCategory } from '../entities/conduct-report.entity';

export class CreateRatingDto {
  @IsIn(RATING_DIRECTIONS) direction: RatingDirection;
  @IsUUID() interactionId: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) stars: number;
  @ValidateIf((value: CreateRatingDto) => value.stars <= 2)
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  comment?: string;
}

export class CreateConductReportDto {
  @IsIn(RATING_DIRECTIONS) direction: RatingDirection;
  @IsUUID() interactionId: string;
  @IsIn(CONDUCT_CATEGORIES) category: ConductCategory;
  @IsString() @MinLength(3) @MaxLength(2000) description: string;
}

export class CloseConductReportDto {
  @IsIn(['confirmado', 'no_sustentado'])
  outcome: 'confirmado' | 'no_sustentado';
  @IsString() @MinLength(3) @MaxLength(2000) resolution: string;
}

export class CreateSanctionDto {
  @IsIn(['client', 'employee', 'driver'])
  subjectType: 'client' | 'employee' | 'driver';
  @IsUUID() subjectId: string;
  @IsIn(['suspension', 'permanent_ban'])
  type: 'suspension' | 'permanent_ban';
  @IsString() @MinLength(3) @MaxLength(2000) reason: string;
  @IsOptional() @IsUUID() conductReportId?: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @ValidateIf((value: CreateSanctionDto) => value.type === 'suspension')
  @IsDateString()
  endsAt?: string;
}

export class RevokeSanctionDto {
  @IsString() @MinLength(3) @MaxLength(1000) reason: string;
}
