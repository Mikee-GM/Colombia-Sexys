import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class PortalSessionDto {
  /**
   * Un JWT de acceso, que es lo unico que admite ya `verifyPortalToken`. El
   * tope es generoso a proposito: un token de acceso ronda los 300 caracteres
   * y no tiene por que crecer, pero tampoco conviene ajustarlo tanto que un
   * campo mas en el payload rompa el canje.
   */
  @ApiProperty({ description: 'Token con el que se abrio el portal' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(2000)
  token: string;
}
