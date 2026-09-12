import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Empleadas } from '../../employees/entities/employee.entity';
import { Usuarios } from '../../users/entities/user.entity';

/** De que va el mensaje, para poder leer el hilo sin adivinar. */
export const TIPOS_MENSAJE_EQUIPO = ['duda', 'jornada'] as const;
export type TipoMensajeEquipo = (typeof TIPOS_MENSAJE_EQUIPO)[number];

/**
 * Un mensaje del canal entre una modelo y quien la coordina.
 *
 * El canal es anonimo de un solo lado: el jefe ve con quien habla, la modelo
 * habla siempre con "coordinacion". Por eso `autorUserId` existe pero no sale
 * nunca hacia el portal de ella; se guarda para que el panel del jefe sepa
 * quien contesto y para poder revisar la conversacion despues.
 */
@Index('idx_mensajes_equipo_empleada', ['empleadaId', 'createdAt'], {})
@Entity('mensajes_equipo', { schema: 'public' })
export class MensajesEquipo {
  @Column('uuid', {
    primary: true,
    name: 'id',
    default: () => 'gen_random_uuid()',
  })
  @ApiProperty({
    description: 'Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  id: string;

  @Column('uuid', { name: 'empleada_id' })
  @ApiProperty({ description: 'Empleada dueña del canal' })
  empleadaId: string;

  @ManyToOne(() => Empleadas, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'empleada_id', referencedColumnName: 'id' }])
  empleada: Empleadas;

  @Column('character varying', { name: 'emisor', length: 10 })
  @ApiProperty({ enum: ['empleada', 'jefe'] })
  emisor: 'empleada' | 'jefe';

  /**
   * Quien escribio, cuando el emisor es el jefe. Nunca se expone a la modelo:
   * es el dato que rompe el anonimato del canal.
   */
  @Column('uuid', { name: 'autor_user_id', nullable: true })
  @ApiPropertyOptional({ description: 'Autor del mensaje' })
  autorUserId: string | null;

  @ManyToOne(() => Usuarios, { onDelete: 'SET NULL' })
  @JoinColumn([{ name: 'autor_user_id', referencedColumnName: 'id' }])
  autor: Usuarios | null;

  @Column('text', { name: 'cuerpo' })
  @ApiProperty({ description: 'Texto del mensaje' })
  cuerpo: string;

  @Column('character varying', {
    name: 'tipo',
    length: 20,
    default: 'duda',
  })
  @ApiProperty({ enum: TIPOS_MENSAJE_EQUIPO })
  tipo: TipoMensajeEquipo;

  @Column('timestamp with time zone', { name: 'leido_at', nullable: true })
  @ApiPropertyOptional({
    description: 'Cuando lo leyo el destinatario',
    type: String,
    format: 'date-time',
  })
  leidoAt: Date | null;

  @Column('timestamp with time zone', {
    name: 'created_at',
    default: () => 'now()',
  })
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt: Date;
}
