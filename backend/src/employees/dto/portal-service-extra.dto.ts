import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsUUID } from 'class-validator';

export class AddPortalServiceExtraDto {
  @ApiProperty({
    description: 'Extra del catalogo de la empleada que se le cobra al cliente',
    example: '00000000-0000-4000-8000-000000000000',
  })
  @IsUUID()
  extraCatalogoId: string;

  @ApiProperty({
    description: 'Como paga el cliente este extra',
    enum: ['tarjeta', 'transferencia', 'efectivo'],
    example: 'efectivo',
  })
  @IsIn(['tarjeta', 'transferencia', 'efectivo'])
  metodoPago: 'tarjeta' | 'transferencia' | 'efectivo';
}
