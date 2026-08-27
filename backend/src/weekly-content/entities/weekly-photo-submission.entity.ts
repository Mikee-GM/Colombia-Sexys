import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Empleadas } from '../../employees/entities/employee.entity';

export type SubmissionStatus =
  'pendiente' | 'aprobada_publica' | 'aprobada_privada' | 'rechazada';

@Index('idx_weekly_photo_submissions_empleada', ['empleadaId'], {})
@Index('idx_weekly_photo_submissions_estado', ['estado'], {})
@Index('weekly_photo_submissions_pkey', ['id'], { unique: true })
@Entity('weekly_photo_submissions', { schema: 'public' })
export class WeeklyPhotoSubmission {
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
  @ApiProperty({
    description: 'Empleada Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  empleadaId: string;

  @Column('text', { name: 'url' })
  @ApiProperty({
    description: 'Url de la foto subida a R2',
    example: 'https://example.com/foto_semanal.jpg',
  })
  url: string;

  @Column('varchar', {
    name: 'estado',
    length: 30,
    default: () => "'pendiente'",
  })
  @ApiProperty({
    description: 'Estado de revisión',
    enum: ['pendiente', 'aprobada_publica', 'aprobada_privada', 'rechazada'],
    example: 'pendiente',
  })
  estado: SubmissionStatus;

  @Column('date', {
    name: 'semana_inicio',
    nullable: true,
  })
  @ApiProperty({
    description: 'Fecha de inicio de la semana correspondiente (Viernes)',
    example: '2026-08-14',
  })
  semanaInicio: string | null;

  @Column('uuid', { name: 'revisado_por_user_id', nullable: true })
  @ApiProperty({
    description: 'ID del administrador que revisó la foto',
    nullable: true,
  })
  revisadoPorUserId: string | null;

  /**
   * Por qué se rechazó la foto. Solo lo llevan las rechazadas: una aprobación
   * lo deja en null para que una foto revisada dos veces no arrastre el motivo
   * de la decisión anterior.
   */
  @Column('text', { name: 'motivo_rechazo', nullable: true })
  @ApiProperty({
    description: 'Motivo del rechazo, visible para la empleada en su portal',
    nullable: true,
    example: 'La foto está movida y se ve a otra persona al fondo.',
  })
  motivoRechazo: string | null;

  @Column('timestamp with time zone', {
    name: 'revisado_at',
    nullable: true,
  })
  @ApiProperty({
    description: 'Fecha y hora de revisión',
    nullable: true,
  })
  revisadoAt: Date | null;

  @Column('timestamp with time zone', {
    name: 'created_at',
    default: () => 'now()',
  })
  @ApiProperty({
    description: 'Created At',
    type: String,
    format: 'date-time',
    example: '2026-08-17T12:00:00.000Z',
  })
  createdAt: Date;

  @ManyToOne(() => Empleadas, (empleadas) => empleadas.weeklyPhotoSubmissions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'empleada_id', referencedColumnName: 'id' }])
  @ApiProperty({ description: 'Empleada', type: () => Empleadas })
  empleada: Empleadas;
}
