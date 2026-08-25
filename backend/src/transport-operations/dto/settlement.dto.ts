import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';

export class CashPaymentDto {
  @IsUUID() employeeId: string;
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;
  @IsOptional() @IsString() @Length(1, 240) note?: string;
}
/** Motivo opcional del deshacer, para que el historial explique el cambio. */
export class RevertCashPaymentDto {
  @IsOptional() @IsString() @Length(1, 240) reason?: string;
}
export class SettlementPeriodDto {
  @IsDateString() startDate: string;
  @IsDateString() endDate: string;
}
export class DriverReportQueryDto extends SettlementPeriodDto {
  @IsUUID() driverId: string;
}
