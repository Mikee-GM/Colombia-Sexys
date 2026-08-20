import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export class CreateDriverShiftDto {
  @IsString() @MinLength(3) @MaxLength(120) title: string;

  @Matches(TIME_PATTERN, { message: 'startsAt debe tener formato HH:MM' })
  startsAt: string;

  @Matches(TIME_PATTERN, { message: 'endsAt debe tener formato HH:MM' })
  endsAt: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsIn(WEEKDAYS, { each: true })
  daysOfWeek: number[];

  @IsOptional() @IsInt() @Min(1) @Max(100) capacity?: number;
}

export class UpdateDriverShiftDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(120) title?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'startsAt debe tener formato HH:MM' })
  startsAt?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'endsAt debe tener formato HH:MM' })
  endsAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @IsIn(WEEKDAYS, { each: true })
  daysOfWeek?: number[];

  @IsOptional() @IsInt() @Min(1) @Max(100) capacity?: number;
}

export class AssignDriverShiftDto {
  @IsUUID() driverId: string;
}
