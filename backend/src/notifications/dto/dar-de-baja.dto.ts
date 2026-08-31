import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DarDeBajaDto {
  @ApiProperty({ description: 'Endpoint del dispositivo que se da de baja' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  endpoint: string;
}
