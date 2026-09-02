import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
  MinLength,
  MaxLength,
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

/**
 * Motivo por el que se reabre una semana ya pagada de un chofer.
 *
 * Se exige, igual que en el de la modelo: deshacer suelta los viajes para que
 * la siguiente liquidacion los recoja, y sin motivo escrito es indistinguible
 * de un descuadre.
 */
export class DeshacerLiquidacionDto {
  @IsDateString()
  startDate: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  motivo: string;
}
