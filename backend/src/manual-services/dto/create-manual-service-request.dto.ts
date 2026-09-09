import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Lo que hay que saber de un servicio que se cuadro fuera del sistema. */
export class CreateManualServiceRequestDto {
  /**
   * Sin `tipo` la solicitud se entiende como `pasado`, que es lo unico que
   * existia antes: asi los clientes viejos siguen funcionando igual.
   */
  @ApiPropertyOptional({
    description:
      'Si el servicio ya ocurrió (pasado) o la empleada acaba de cuadrarlo y aún no lo hace (inmediato)',
    enum: ['pasado', 'inmediato'],
    default: 'pasado',
  })
  @IsIn(['pasado', 'inmediato'])
  @IsOptional()
  readonly tipo?: 'pasado' | 'inmediato';

  @ApiPropertyOptional({ description: 'Cliente registrado, si se identifica' })
  @IsUUID()
  @IsOptional()
  readonly clienteId?: string;

  @ApiPropertyOptional({
    description: 'Nombre del cliente si no esta registrado',
  })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  readonly clienteNombreLibre?: string;

  @ApiProperty({ description: 'Cuando ocurrio, en ISO' })
  @IsString()
  readonly fechaServicio: string;

  /**
   * Las horas del servicio, ahora que la modelo puede escribirlas a mano.
   *
   * Antes solo llegaban las de una lista cerrada de botones, asi que bastaba
   * con `@IsNumber()`. Con el campo libre entra lo que ella teclee, y un cero,
   * un negativo o un 500 crearian un servicio con un importe absurdo que el
   * jefe tendria que cazar a ojo. El maximo son 24 horas --un dia-- y el minimo
   * media, que es lo mas corto que se cuadra. La columna es `numeric(4,2)`, de
   * modo que los decimales caben.
   */
  @ApiProperty({ description: 'Duracion en horas', example: 2 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(24)
  readonly duracionHoras: number;

  @ApiProperty({ description: 'Metodo de pago', example: 'efectivo' })
  @IsIn(['efectivo', 'tarjeta', 'transferencia', 'mixto'])
  readonly metodoPago: 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto';

  @ApiProperty({ description: 'Lo que se le cobro al cliente', example: 2400 })
  @Type(() => Number)
  @IsNumber()
  readonly montoCobrado: number;

  @ApiPropertyOptional({ description: 'Donde fue' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  readonly ubicacion?: string;

  @ApiProperty({ description: 'Por que no se registro en su momento' })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  readonly motivo: string;
}
