import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Empleadas } from '../../employees/entities/employee.entity';

export type WeeklyScheduleStatus =
  | 'solicitado'
  | 'recordatorio_enviado'
  | 'entregado'
  | 'falta_aplicada';

@Index('weekly_content_schedules_empleada_semana_key', ['empleadaId', 'semanaInicio'], {
  unique: true,
})
@Index('idx_weekly_content_schedules_empleada', ['empleadaId'], {})
@Index('weekly_content_schedules_pkey', ['id'], { unique: true })
@Entity('weekly_content_schedules', { schema: 'public' })
export class WeeklyContentSchedule {
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

  @Column('date', { name: 'semana_inicio' })
  @ApiProperty({
    description: 'Fecha de inicio del ciclo semanal (Viernes)',
    example: '2026-08-14',
  })
  semanaInicio: string;

  @Column('varchar', {
    name: 'estado',
    length: 30,
    default: () => "'solicitado'",
  })
  @ApiProperty({
    description: 'Estado del ciclo semanal',
    enum: ['solicitado', 'recordatorio_enviado', 'entregado', 'falta_aplicada'],
    example: 'solicitado',
  })
  estado: WeeklyScheduleStatus;

  @Column('timestamp with time zone', {
    name: 'solicitado_at',
    default: () => 'now()',
  })
  @ApiProperty({
    description: 'Fecha de solicitud inicial (Viernes)',
  })
  solicitadoAt: Date;

  @Column('timestamp with time zone', {
    name: 'recordatorio_at',
    nullable: true,
  })
  @ApiProperty({
    description: 'Fecha de envío del recordatorio (Sábado, 24h)',
    nullable: true,
  })
  recordatorioAt: Date | null;

  @Column('timestamp with time zone', {
    name: 'falta_at',
    nullable: true,
  })
  @ApiProperty({
    description: 'Fecha de aplicación de la falta (Domingo, 48h)',
    nullable: true,
  })
  faltaAt: Date | null;

  @Column('timestamp with time zone', {
    name: 'entregado_at',
    nullable: true,
  })
  @ApiProperty({
    description: 'Fecha en la que la modelo subió sus fotos',
    nullable: true,
  })
  entregadoAt: Date | null;

  @ManyToOne(() => Empleadas, (empleadas) => empleadas.weeklySchedules, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'empleada_id', referencedColumnName: 'id' }])
  @ApiProperty({ description: 'Empleada', type: () => Empleadas })
  empleada: Empleadas;
}
