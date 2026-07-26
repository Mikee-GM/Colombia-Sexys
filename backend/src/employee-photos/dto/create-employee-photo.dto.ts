import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
} from 'class-validator';

export class CreateEmployeePhotoDto {
  @ApiProperty({
    description: 'ID de la empleada propietaria de la foto',
    example: '00000000-0000-4000-8000-000000000000',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'El ID de la empleada debe ser un UUID v4 válido' })
  @IsNotEmpty({ message: 'El ID de la empleada es obligatorio' })
  readonly empleadaId: string;

  @ApiProperty({
    description: 'URL publica de la foto',
    example: 'https://example.com/foto.jpg',
  })
  @IsString({ message: 'La URL debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La URL es obligatoria' })
  readonly url: string;

  @ApiPropertyOptional({
    description: 'Orden de aparicion en galeria',
    example: 1,
  })
  @IsNumber({}, { message: 'El orden debe ser un número válido' })
  @IsOptional()
  readonly orden?: number;
}
