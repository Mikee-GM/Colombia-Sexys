import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';

export class AddPortalServiceExtraDto {
  /**
   * Extra del catalogo. Opcional: se omite cuando se cobra un precio escrito a
   * mano, que es lo que pasa con lo que no esta en el catalogo de la modelo.
   */
  @ApiPropertyOptional({
    description: 'Extra del catalogo de la empleada que se le cobra al cliente',
    example: '00000000-0000-4000-8000-000000000000',
  })
  @IsOptional()
  @IsUUID()
  extraCatalogoId?: string;

  /**
   * Precio escrito a mano. Manda sobre el del catalogo cuando llegan los dos,
   * porque es lo que la modelo acaba de acordar con el cliente.
   */
  @ApiPropertyOptional({
    description: 'Precio acordado, si no es el del catalogo',
    example: 500,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  precioCobrado?: number;

  @ApiProperty({
    description: 'Los extras operativos nuevos se registran solo con tarjeta',
    enum: ['tarjeta'],
    example: 'tarjeta',
  })
  @IsIn(['tarjeta'], {
    message: 'Registra unicamente extras cobrados con tarjeta',
  })
  metodoPago: 'tarjeta';
}
