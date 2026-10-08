import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateBookingDraftDto {
  @IsOptional()
  @IsUUID()
  intendedEmployeeId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.25)
  durationHours?: number;

  @IsOptional()
  @IsBoolean()
  openEndedDuration?: boolean;

  @IsOptional()
  @IsIn(['preset', 'external'])
  placeType?: 'preset' | 'external';

  @IsOptional()
  @IsUUID()
  presetLocationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  locationName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  locationAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  locationNotes?: string;

  /** Nota operativa del jefe, separada de las indicaciones del cliente. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  bossNotes?: string;

  @IsOptional()
  @IsNumber()
  locationLat?: number;

  @IsOptional()
  @IsNumber()
  locationLng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  room?: string;

  @IsOptional()
  @IsIn(['efectivo', 'tarjeta', 'transferencia', 'mixto'])
  paymentMethod?: 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto';

  @IsOptional()
  @IsIn(['inmediato', 'programado'])
  scheduleType?: 'inmediato' | 'programado';

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}
