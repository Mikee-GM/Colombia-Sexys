import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export class UpdatePortalTripStatusDto {
  @ApiProperty({
    description:
      'Avance del viaje de la empleada: en_camino cuando sale, llegue cuando llega al destino',
    enum: ['en_camino', 'llegue'],
    example: 'en_camino',
  })
  @IsIn(['en_camino', 'llegue'])
  estado: 'en_camino' | 'llegue';
}
