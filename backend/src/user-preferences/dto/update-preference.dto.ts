import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class UpdatePreferenceDto {
  /**
   * Contenido libre: cada clave decide su forma. El tamaño si se acota, en el
   * servicio, para que esto no acabe siendo un almacen.
   */
  @ApiProperty({
    description: 'Contenido del ajuste. Su forma depende de la clave',
    type: Object,
    example: { orden: ['kpis', 'operacion'], ocultos: ['god-eye'] },
  })
  @IsObject()
  value: Record<string, unknown>;
}
