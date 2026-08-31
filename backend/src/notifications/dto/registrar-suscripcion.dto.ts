import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNotEmpty,
  IsObject,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Las claves con las que el navegador descifra el aviso. */
export class ClavesSuscripcionDto {
  @ApiProperty({ description: 'Clave publica del navegador' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  p256dh: string;

  @ApiProperty({ description: 'Secreto de autenticacion del navegador' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  auth: string;
}

export class RegistrarSuscripcionDto {
  /**
   * El limite existe porque este texto va a una columna indexada por unicidad y
   * lo elige el navegador: sin tope, un cliente manipulado podria mandar
   * kilobytes en cada alta.
   */
  @ApiProperty({
    description: 'URL del servicio de push del navegador',
    example: 'https://fcm.googleapis.com/fcm/send/...',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  endpoint: string;

  @ApiProperty({ type: ClavesSuscripcionDto })
  @IsObject()
  @ValidateNested()
  @Type(() => ClavesSuscripcionDto)
  keys: ClavesSuscripcionDto;
}
