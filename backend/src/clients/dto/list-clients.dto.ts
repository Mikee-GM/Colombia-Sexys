import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListClientsDto {
  @ApiPropertyOptional({ description: 'Filtro por nombre de Telegram' })
  @IsString()
  @IsOptional()
  readonly search?: string;

  @ApiPropertyOptional({ description: 'Máximo de resultados', default: 50 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  @IsOptional()
  readonly limit?: number;

  @ApiPropertyOptional({ description: 'Desplazamiento', default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  readonly offset?: number;
}
