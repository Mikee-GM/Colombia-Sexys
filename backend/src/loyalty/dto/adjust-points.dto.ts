import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AdjustPointsDto {
  @ApiProperty({
    description: 'Puntos a sumar o restar al cliente',
    example: 100,
  })
  @IsInt()
  readonly points: number;

  @ApiProperty({
    description: 'Motivo del ajuste manual',
    example: 'Bonificacion por servicio especial',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  readonly description: string;
}
