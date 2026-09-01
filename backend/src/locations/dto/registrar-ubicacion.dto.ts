import { IsNumber, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Lo que manda el navegador desde el portal.
 *
 * Los limites estan aqui ademas de en el servicio porque el DTO rechaza antes
 * de tocar nada, y porque unas coordenadas fuera de rango casi siempre son un
 * error de unidades, no un movimiento real.
 */
export class RegistrarUbicacionDto {
  @ApiProperty({ description: 'Latitud', example: 19.432608 })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ description: 'Longitud', example: -99.133209 })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;
}
