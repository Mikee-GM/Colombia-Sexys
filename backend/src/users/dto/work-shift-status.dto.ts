import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/** Tope del motivo. Es una frase, no un informe. */
export const MAX_LARGO_MOTIVO = 500;

export class WorkShiftStatusDto {
  @ApiProperty({
    description:
      'true para seguir dentro de la jornada, false para cerrarla por hoy',
  })
  @IsBoolean()
  enJornada: boolean;

  /**
   * Por que cierra. Siempre opcional: el boton de cerrar no puede quedar
   * condicionado a escribir nada, y quien no quiera decirlo no tiene por que.
   */
  @ApiPropertyOptional({
    description: 'Motivo del cierre, opcional',
    maxLength: MAX_LARGO_MOTIVO,
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(MAX_LARGO_MOTIVO)
  motivo?: string;
}
