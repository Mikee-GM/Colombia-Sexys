import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Servicios } from '../../services/entities/service.entity';

@Index('prorrogas_pkey', ['id'], { unique: true })
@Index(
  'prorrogas_servicio_id_numero_prorroga_key',
  ['numeroProrroga', 'servicioId'],
  { unique: true },
)
@Index('idx_prorrogas_servicio', ['servicioId'], {})
@Entity('prorrogas', { schema: 'public' })
export class Prorrogas {
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

  @Column('uuid', { name: 'servicio_id' })
  @ApiProperty({
    description: 'Servicio Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  servicioId: string;

  @Column('smallint', { name: 'numero_prorroga' })
  @ApiProperty({ description: 'Numero Prorroga', example: 1 })
  numeroProrroga: number;

  @Column('smallint', { name: 'minutos_solicitados' })
  @ApiProperty({ description: 'Minutos Solicitados', example: 1 })
  minutosSolicitados: number;

  @Column('timestamp with time zone', {
    name: 'solicitada_at',
    default: () => 'now()',
  })
  @ApiProperty({
    description: 'Solicitada At',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  solicitadaAt: Date;

  @Column('boolean', { name: 'aprobada', default: () => 'true' })
  @ApiProperty({ description: 'Aprobada', example: true })
  aprobada: boolean;

  @ManyToOne(() => Servicios, (servicios) => servicios.prorrogases, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'servicio_id', referencedColumnName: 'id' }])
  @ApiProperty({ description: 'Servicio', type: () => Servicios })
  servicio: Servicios;
}
