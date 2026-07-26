import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID, IsNumber, Min } from 'class-validator';

export class CreateCatalogExtraDto {
  @ApiProperty({
    description: 'ID de la Empleada',
    example: 'd3b07384-d113-4956-a5e1-20a7b545f4e1',
  })
  @IsUUID()
  @IsNotEmpty()
  readonly empleadaId: string;

  @ApiProperty({
    description: 'Nombre del servicio extra',
    example: 'Baile privado',
  })
  @IsString()
  @IsNotEmpty()
  readonly nombre: string;

  @ApiProperty({ description: 'Precio del servicio extra', example: 500.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsNotEmpty()
  readonly precio: number;
}
