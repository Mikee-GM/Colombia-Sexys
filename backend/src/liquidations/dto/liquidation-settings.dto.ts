import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateLiquidationSettingsDto {
  @ApiPropertyOptional({
    description:
      'Porcentaje que retiene la empresa sobre un extra cobrado con tarjeta que alcance el umbral',
    example: 15,
    minimum: 0,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  cardExtraCommissionPercentage?: number;

  @ApiPropertyOptional({
    description:
      'Importe a partir del cual un extra con tarjeta paga comision. Por debajo va integro a la empleada',
    example: 1000,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cardExtraCommissionThreshold?: number;
}
