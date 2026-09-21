import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsOptional } from 'class-validator';

/**
 * Mover una cita ya creada a otra fecha y hora.
 *
 * Va por su propia ruta y no por `UpdateServiceDto` a proposito: cambiar la
 * hora no es editar un campo. Hay que comprobar que la modelo no tenga ya otro
 * compromiso encima, reiniciar el recordatorio previo y avisar a quien tiene
 * que presentarse. Metido en la lista blanca del PATCH generico, nada de eso
 * llegaria a ocurrir.
 */
export class RescheduleServiceDto {
  @ApiProperty({
    description:
      'Nueva fecha y hora de la cita, en ISO 8601 y con zona. El panel la ' +
      'convierte desde la hora de México antes de mandarla.',
    example: '2026-09-21T20:00:00.000Z',
  })
  @IsISO8601()
  fechaProgramada: string;

  /**
   * Por defecto se le avisa: una cita movida sin avisar al cliente es un
   * cliente que se presenta a la hora vieja. Se puede desactivar para las
   * correcciones de captura, donde nunca hubo una hora equivocada que deshacer.
   */
  @ApiPropertyOptional({
    description: 'Mandar al cliente el aviso del cambio por Telegram',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  avisarCliente?: boolean;
}
