import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
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

/**
 * Por que tuvo que cerrarlo la oficina y no la modelo.
 *
 * Se exige un motivo de verdad porque es lo unico que distingue una correccion
 * legitima de un descuadre dentro de una semana: al cerrar se calculan las
 * horas facturadas, el total y lo que le toca a ella.
 */
export class CerrarPorOficinaDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  motivo: string;
}
