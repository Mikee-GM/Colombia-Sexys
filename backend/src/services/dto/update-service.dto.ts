import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Lo que se puede corregir de un servicio ya creado.
 *
 * Antes era `PartialType(CreateServiceDto)`, con lo que la lista blanca del
 * `ValidationPipe` --que es lo unico que separa esta ruta de una escritura
 * libre-- se abria a todo lo que hace falta para *crear* uno: la empleada
 * asignada, el jefe, el precio base pactado y las coordenadas del cliente.
 *
 * Reasignar la empleada por aqui no hacia nada de lo que hay que hacer al
 * reasignar --liberar a la anterior, avisar a las dos, rehacer el viaje-- y
 * dejaba el servicio apuntando a otra persona sin que nadie se enterara. El
 * precio base pactado es peor: se copia al crear justamente para que un cambio
 * de tarifa posterior no altere lo ya acordado, y editarlo despues reescribe el
 * trato con el cliente.
 *
 * Estos cuatro campos son los que mandan de verdad las dos pantallas que usan
 * la ruta: la ficha del jefe y la del panel de admin.
 */
export class UpdateServiceDto {
  @ApiPropertyOptional({ description: 'Horas pactadas', example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(24)
  duracionPactadaHoras?: number;

  @ApiPropertyOptional({
    description: 'Método de pago',
    enum: ['efectivo', 'tarjeta', 'transferencia', 'mixto'],
  })
  @IsOptional()
  @IsIn(['efectivo', 'tarjeta', 'transferencia', 'mixto'])
  metodoPago?: 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto';

  @ApiPropertyOptional({ description: 'Notas del servicio' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notas?: string;

  @ApiPropertyOptional({ description: 'Notas internas del jefe' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notasJefe?: string;
}
