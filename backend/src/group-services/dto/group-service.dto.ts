import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateGroupRequestDto {
  @IsUUID()
  clientId: string;

  @IsOptional()
  @IsUUID()
  initialEmployeeId?: string;

  @IsOptional()
  @IsUUID()
  bookingSessionId?: string;
}

export class UpdateGroupRequestDto {
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(24)
  durationHours?: number;

  @IsOptional()
  @IsEnum(['efectivo', 'tarjeta', 'transferencia', 'mixto'])
  paymentMethod?: 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto';

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  locationLat?: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  locationLng?: number;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  locationReference?: string;
}

export class ReserveGroupSelectionDto {
  @IsArray()
  @ArrayMinSize(2)
  @IsUUID('4', { each: true })
  employeeIds: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  catalogVersion?: number;

  @IsOptional()
  @IsEnum(['cliente', 'jefe'])
  selectedBy?: 'cliente' | 'jefe';
}

export class TransportUnitDto {
  @IsInt()
  @Min(1)
  unitNumber: number;

  @IsEnum(['ida', 'regreso'])
  direction: 'ida' | 'regreso';

  @IsEnum(['chofer', 'uber'])
  provider: 'chofer' | 'uber';

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  employeeIds: string[];
}

export class ConfirmGroupQuoteDto {
  @IsUUID()
  responsibleEmployeeId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransportUnitDto)
  transportUnits: TransportUnitDto[];
}

export class ConfigureGroupTransportDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransportUnitDto)
  transportUnits: TransportUnitDto[];
}

export class RegisterGroupPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsUUID()
  receiptValidationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  fingerprint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string;
}

export class AddGroupParticipantDto {
  @IsUUID()
  employeeId: string;

  @IsOptional()
  @IsBoolean()
  needsNewTransport?: boolean;

  @IsOptional()
  @IsEnum(['chofer', 'uber'])
  transportProvider?: 'chofer' | 'uber';
}

export class RemoveGroupParticipantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  manualTransportCharge?: number;
}

export class ChangeGroupResponsibleDto {
  @IsUUID()
  employeeId: string;
}

export class ChangeGroupDurationDto {
  @IsNumber()
  @Min(1)
  @Max(24)
  durationHours: number;
}

export class ManualTransportChargeDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason: string;
}

export class GroupRequestMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  message: string;
}
