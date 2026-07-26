import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';

export class CashPaymentDto {
  @IsUUID() employeeId: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
  @IsOptional() @IsString() @Length(1, 240) note?: string;
}
export class SettlementPeriodDto {
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
}
