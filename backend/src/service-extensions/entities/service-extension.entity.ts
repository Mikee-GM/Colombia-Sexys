import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Servicios } from '../../services/entities/service.entity';

import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';

@Index('extensiones_servicio_pkey', ['id'], { unique: true })
@Index('idx_extensiones_servicio_servicio', ['servicioId'], {})
@Entity('extensiones_servicio', { schema: 'public' })
export class ExtensionesServicio {
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

  @Column('numeric', {
    name: 'horas_agregadas',
    precision: 4,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({ description: 'Horas Agregadas', example: 2.0 })
  horasAgregadas: number;

  @Column('numeric', {
    name: 'monto_agregado',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({ description: 'Monto Agregado', example: 1200.0 })
  montoAgregado: number;

  @Column('numeric', {
    name: 'employee_percentage_snapshot',
    precision: 5,
    scale: 2,
    default: 60,
    transformer: new ColumnNumericTransformer(),
  })
  employeePercentageSnapshot: number;

  @Column('numeric', {
    name: 'employee_expected_snapshot',
    precision: 12,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  employeeExpectedSnapshot: number;

  @Column('varchar', {
    name: 'financial_snapshot_status',
    length: 24,
    default: 'captured',
  })
  financialSnapshotStatus: 'captured' | 'legacy_backfill';

  @Column('enum', { name: 'aceptada_por', enum: ['cliente', 'empleada'] })
  @ApiProperty({
    description: 'Aceptada Por',
    enum: ['cliente', 'empleada'],
    example: 'cliente',
  })
  aceptadaPor: 'cliente' | 'empleada';

  @Column('timestamp with time zone', {
    name: 'registrada_at',
    default: () => 'now()',
  })
  @ApiProperty({
    description: 'Registrada At',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  registradaAt: Date;

  @ManyToOne(() => Servicios, (servicios) => servicios.extensionesServicios, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'servicio_id', referencedColumnName: 'id' }])
  @ApiProperty({ description: 'Servicio', type: () => Servicios })
  servicio: Servicios;
}
