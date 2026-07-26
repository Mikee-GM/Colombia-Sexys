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
}
