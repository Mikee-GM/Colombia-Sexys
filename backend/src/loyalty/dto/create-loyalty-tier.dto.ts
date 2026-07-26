import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateLoyaltyTierDto {
  @ApiProperty({
    description: 'Codigo unico del nivel de lealtad',
    example: 'gold',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  readonly code: string;

  @ApiProperty({
    description: 'Nombre visible del nivel',
    example: 'Gold',
    maxLength: 120,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  readonly name: string;

  @ApiProperty({
    description: 'Gasto minimo para alcanzar el nivel',
    example: 5000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  readonly minSpend: number;

  @ApiPropertyOptional({
    description: 'Tasa de acumulacion de puntos',
    example: 1.5,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  readonly earnRate?: number;

  @ApiPropertyOptional({
    description: 'Indica si el nivel esta activo',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  readonly active?: boolean;

  @ApiPropertyOptional({ description: 'Orden de despliegue', example: 10 })
  @IsInt()
  @IsOptional()
  readonly sortOrder?: number;
}
