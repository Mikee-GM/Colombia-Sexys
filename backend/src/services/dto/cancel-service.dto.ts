import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  CANCELLATION_REASONS,
  type CancellationReason,
} from '../cancellation-reasons';

export class CancelServiceDto {
  /**
   * Obligatorio a proposito: el motivo es justo lo que faltaba para poder
   * decidir despues quien asume el costo de la cancelacion.
   */
  @ApiProperty({ enum: CANCELLATION_REASONS })
  @IsIn(CANCELLATION_REASONS)
  reason: CancellationReason;

  @ApiPropertyOptional({
    description: 'Detalle libre de lo que pasó',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
