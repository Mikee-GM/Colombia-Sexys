import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { Transform } from 'class-transformer';
import {
  TIPOS_MENSAJE_EQUIPO,
  type TipoMensajeEquipo,
} from '../entities/team-message.entity';

/** Tope de un mensaje. Telegram parte cualquier cosa mas larga. */
export const MAX_LARGO_MENSAJE = 2000;

export class EnviarMensajeEquipoDto {
  @ApiProperty({
    description: 'Texto del mensaje',
    maxLength: MAX_LARGO_MENSAJE,
  })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, MAX_LARGO_MENSAJE)
  cuerpo: string;

  @ApiPropertyOptional({ enum: TIPOS_MENSAJE_EQUIPO, default: 'duda' })
  @IsOptional()
  @IsIn(TIPOS_MENSAJE_EQUIPO)
  tipo?: TipoMensajeEquipo;
}

export class EnviarMensajeDelJefeDto extends EnviarMensajeEquipoDto {
  @ApiProperty({ description: 'Empleada a la que se escribe' })
  @IsUUID()
  empleadaId: string;
}

/**
 * Un mensaje tal y como lo ve la modelo.
 *
 * No lleva autor ni nada que identifique al jefe: ese es justamente el punto
 * del canal. Se declara aparte de la entidad para que sea imposible filtrar el
 * dato por descuido al devolver la fila entera.
 */
export interface MensajeParaEmpleada {
  id: string;
  emisor: 'empleada' | 'coordinacion';
  cuerpo: string;
  tipo: TipoMensajeEquipo;
  createdAt: string;
}

/** Un mensaje tal y como lo ve el jefe: con autor y con quien lo escribio. */
export interface MensajeParaJefe {
  id: string;
  emisor: 'empleada' | 'jefe';
  autor: string | null;
  cuerpo: string;
  tipo: TipoMensajeEquipo;
  leidoAt: string | null;
  createdAt: string;
}
