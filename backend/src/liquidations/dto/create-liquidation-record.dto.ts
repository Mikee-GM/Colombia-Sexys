import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { LIQUIDATION_PAYMENT_METHODS } from '../entities/liquidation-record.entity';

export class CreateLiquidationRecordDto {
  @IsUUID('4')
  employeeId: string;

  @Type(() => Date)
  @IsDate()
  occurredAt: Date;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  serviceTotal: number;

  @ApiProperty({ enum: LIQUIDATION_PAYMENT_METHODS })
  @IsEnum(LIQUIDATION_PAYMENT_METHODS)
  paymentMethod: (typeof LIQUIDATION_PAYMENT_METHODS)[number];

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cashAmount?: number;

  @ApiPropertyOptional({ type: [Number], maxItems: 5 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { each: true })
  @Min(0, { each: true })
  cardAmounts?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  companyPercentage?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  extraAmount?: number;

  @IsOptional()
  @IsBoolean()
  promotion?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  membershipAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  companyTransportExpense?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  transportExcess?: number;

  @IsOptional()
  @IsString()
  @Length(1, 120)
  place?: string;

  @IsOptional()
  @IsBoolean()
  hasOutboundDriver?: boolean;

  @IsOptional()
  @IsBoolean()
  hasReturnDriver?: boolean;

  @IsOptional()
  @IsBoolean()
  cancelled?: boolean;

  @IsOptional()
  @IsBoolean()
  isFine?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  fineAmount?: number;
}
