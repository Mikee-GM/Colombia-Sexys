import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsEnum,
} from 'class-validator';

export class CreateServiceDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsUUID()
  empleadaId: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsUUID()
  clienteId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  jefeId?: string;

  @ApiProperty({ enum: ['efectivo', 'tarjeta', 'transferencia'] })
  @IsNotEmpty()
  @IsEnum(['efectivo', 'tarjeta', 'transferencia'])
  metodoPago: 'efectivo' | 'tarjeta' | 'transferencia';

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  duracionPactadaHoras: number;

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
}
