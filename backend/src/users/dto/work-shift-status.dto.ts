import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class WorkShiftStatusDto {
  @ApiProperty({
    description:
      'true para seguir dentro de la jornada, false para cerrarla por hoy',
  })
  @IsBoolean()
  enJornada: boolean;
}
