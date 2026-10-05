import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class ExtendServiceDto {
  /**
   * El rango lo vuelve a comprobar `extendByEmployee`, que es quien manda: esto
   * solo evita el viaje al servicio con un valor que no tiene sentido.
   */
  @ApiProperty({ description: 'Horas que se añaden al servicio', example: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  horas: number;

  @ApiPropertyOptional({
    description:
      'Monto acordado para la extensión; puede diferir de la sugerencia',
    example: 2500,
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  montoAcordado?: number;
}
