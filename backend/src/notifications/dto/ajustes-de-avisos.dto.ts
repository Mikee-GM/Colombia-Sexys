import { ArrayMaxSize, IsArray, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Los avisos que esta persona no quiere recibir.
 *
 * Se manda la lista entera y no un cambio suelto: la pantalla dibuja todos los
 * interruptores a la vez, asi que enviarlos todos evita que dos telefonos que
 * guardan a la vez se pisen a medias y quede un estado que nadie eligio.
 *
 * El tope de tamaño no es defensivo por gusto: lo que llega aqui acaba en un
 * `jsonb` que se lee en cada aviso.
 */
export class AjustesDeAvisosDto {
  @ApiProperty({
    description: 'Tipos de aviso apagados',
    example: ['service_cancelled'],
    isArray: true,
    type: String,
  })
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  apagados: string[];
}
