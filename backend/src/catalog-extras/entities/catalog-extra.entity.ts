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
  @ApiProperty({ description: 'Precio', example: 1200.0 })
  precio: number;

  @Column('boolean', { name: 'activo', default: () => 'true' })
  @ApiProperty({ description: 'Activo', example: true })
  activo: boolean;

  /**
   * El extra comodin al que se cuelgan los cobros de monto libre. No es una
   * oferta del catalogo, asi que no se le enseña a nadie; existe solo para que
   * el cobro tenga a que apuntar. Sigue `activo` porque tiene que poder
   * usarse.
   */
  @Column('boolean', { name: 'es_generico', default: () => 'false' })
  @ApiProperty({ description: 'Extra comodín de monto libre', example: false })
  esGenerico: boolean;

  @Column('jsonb', {
    name: 'modelos_vinculadas_ids',
    nullable: true,
    default: () => "'[]'",
  })
  @ApiPropertyOptional({
    description: 'IDs de modelos vinculadas para extras grupales / trios',
    type: [String],
    example: ['00000000-0000-4000-8000-000000000000'],
  })
  modelosVinculadasIds?: string[] | null;

  @Column('text', { name: 'speech_personalizado', nullable: true })
  @ApiPropertyOptional({
    description:
      'Texto exacto que la modelo debe enviar al cliente cuando pregunte por este extra (ej. Atención a parejas)',
    example: 'Amor, con tu pareja los consiento a los dos...',
  })
  speechPersonalizado?: string | null;

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
