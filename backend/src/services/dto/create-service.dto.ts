import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsEnum,
  Max,
  Min,
} from 'class-validator';

export class CreateServiceDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsUUID()
  empleadaId: string;

  @ApiPropertyOptional({
    description:
      'ID del cliente registrado. Opcional cuando el cliente no está registrado.',
  })
  @IsOptional()
  @IsUUID()
  clienteId?: string;

  @ApiPropertyOptional({
    description: 'Nombre libre del cliente cuando no está registrado',
  })
  @IsOptional()
  @IsString()
  clienteNombreLibre?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  jefeId?: string;

  @ApiProperty({ enum: ['efectivo', 'tarjeta', 'transferencia'] })
  @IsNotEmpty()
  @IsEnum(['efectivo', 'tarjeta', 'transferencia'])
  metodoPago: 'efectivo' | 'tarjeta' | 'transferencia';

  /**
   * Horas pactadas. En un servicio indefinido es solo la estimacion inicial
   * para reservar agenda: las horas reales se cuentan al finalizar.
   */
  @ApiProperty({ minimum: 0.5, maximum: 24 })
  @IsNotEmpty()
  @IsNumber()
  @Min(0.5)
  @Max(24)
  duracionPactadaHoras: number;

  @ApiPropertyOptional({
    description:
      'Duracion abierta: las horas se cuentan al finalizar y se redondean hacia arriba a partir de los 15 minutos',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  duracionIndefinida?: boolean;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  ubicacionClienteLat: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  ubicacionClienteLng: number;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  precioBaseHoraPactado: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notas?: string;

  @ApiPropertyOptional({
    description: 'Fecha y hora para servicio programado',
    example: '2026-08-21T18:00:00.000Z',
  })
  @IsOptional()
  fechaProgramada?: Date | string;

  @ApiPropertyOptional({
    description: 'Tipo de agenda',
    enum: ['inmediato', 'programado'],
    default: 'inmediato',
  })
  @IsOptional()
  @IsEnum(['inmediato', 'programado'])
  tipoAgenda?: 'inmediato' | 'programado';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  presetLocationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  clienteTelegramId?: string;
}
