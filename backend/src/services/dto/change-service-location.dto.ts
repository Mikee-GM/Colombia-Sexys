import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * Mover un servicio a otro lugar: o un motel de la casa, o una direccion.
 *
 * Los dos caminos son excluyentes y el servicio se encarga de comprobarlo. No
 * se resuelve con `ValidateIf` porque el mensaje que sale de ahi no le dice
 * nada a quien esta en el panel; el del servicio, si.
 *
 * Lo que se guarda son las coordenadas, no el texto: de ellas cuelgan el chofer
 * mas cercano, el enlace de Uber y el cobro del transporte.
 */
export class ChangeServiceLocationDto {
  @ApiPropertyOptional({
    description: 'ID de un lugar registrado y activo',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  presetLocationId?: string;

  @ApiPropertyOptional({
    description: 'Latitud de la dirección',
    example: 20.5888,
  })
  @IsOptional()
  @IsLatitude()
  latitud?: number;

  @ApiPropertyOptional({
    description: 'Longitud de la dirección',
    example: -100.3899,
  })
  @IsOptional()
  @IsLongitude()
  longitud?: number;

  @ApiPropertyOptional({
    description: 'Dirección en texto, la que devuelve el buscador del mapa',
    example: 'Av. Constituyentes 123, Centro, Querétaro',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(240)
  direccion?: string;
}
