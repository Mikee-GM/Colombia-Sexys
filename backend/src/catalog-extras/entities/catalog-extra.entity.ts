import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Empleadas } from '../../employees/entities/employee.entity';
import { ExtrasServicio } from '../../service-extras/entities/service-extra.entity';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';

@Index('idx_extras_catalogo_empleada', ['empleadaId'], {})
@Index('idx_extras_catalogo_empleada_activo', ['empleadaId', 'activo'], {})
@Index('extras_catalogo_pkey', ['id'], { unique: true })
@Entity('extras_catalogo', { schema: 'public' })
export class ExtrasCatalogo {
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

  @Column('character varying', { name: 'nombre', length: 150 })
  @ApiProperty({ description: 'Nombre', example: 'Ejemplo' })
  nombre: string;

  @Column('numeric', {
    name: 'precio',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({ description: 'Precio', example: 1200.00 })
  precio: number;

  @Column('boolean', { name: 'activo', default: () => 'true' })
  @ApiProperty({ description: 'Activo', example: true })
  activo: boolean;

  @Column('timestamp with time zone', {
    name: 'created_at',
    default: () => 'now()',
  })
  @ApiProperty({
    description: 'Created At',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  createdAt: Date;

  @ManyToOne(() => Empleadas, (empleadas) => empleadas.extrasCatalogos, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'empleada_id', referencedColumnName: 'id' }])
  @ApiProperty({ description: 'Empleada', type: () => Empleadas })
  empleada: Empleadas;

  @OneToMany(
    () => ExtrasServicio,
    (extrasServicio) => extrasServicio.extraCatalogo,
  )
  @ApiProperty({
    description: 'Extras Servicios',
    type: () => [ExtrasServicio],
    example: [],
  })
  extrasServicios: ExtrasServicio[];
}
