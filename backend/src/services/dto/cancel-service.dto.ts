import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  IsUUID,
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

/**
 * A quien pasa el servicio y por que.
 *
 * El motivo se exige igual que en el cierre por la oficina: un servicio
 * reasignado es indistinguible de uno que siempre fue de esa modelo, y el
 * reparto del dinero de la semana se decide mirando quien lo hizo.
 */
export class ReasignarEmpleadaDto {
  @IsUUID()
  empleadaId: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  motivo: string;
}

/** A que chofer pasa el viaje y por que. */
export class ReasignarChoferDto {
  @IsUUID()
  choferId: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  motivo: string;
}

/**
 * Correccion a mano del estado de un viaje.
 *
 * No admite `finalizado` ni `cancelado`: los dos tienen su propio camino, con
 * su costo y su liquidacion. Esto solo arregla un dedazo.
 */
export class CorregirEstadoViajeDto {
  @IsIn(['aceptado', 'en_camino', 'llegado', 'en_curso'])
  estado: 'aceptado' | 'en_camino' | 'llegado' | 'en_curso';

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  motivo: string;
}
