import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateApartmentDto {
  @ApiProperty({
    description: 'Nombre publico del apartamento',
    example: 'Montecarlo 204',
  })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiPropertyOptional({
    description: 'Direccion fisica del apartamento',
    example: 'Av. Principal 123',
  })
  @IsString()
  @IsOptional()
  direccion?: string;

  @ApiPropertyOptional({
    description: 'Notas visibles para identificar el apartamento',
    example: 'Torre B, segundo piso',
  })
  @IsString()
  @IsOptional()
  descripcion?: string;

  @ApiPropertyOptional({
    description: 'Latitud de la ubicacion',
    example: 19.432608,
  })
  @IsNumber()
  @IsOptional()
  ubicacionLat?: number;

  @ApiPropertyOptional({
    description: 'Longitud de la ubicacion',
    example: -99.133209,
  })
  @IsNumber()
  @IsOptional()
  ubicacionLng?: number;
}
