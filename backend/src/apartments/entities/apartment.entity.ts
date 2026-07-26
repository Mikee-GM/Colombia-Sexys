import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Empleadas } from '../../employees/entities/employee.entity';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';

@Entity('apartments', { schema: 'public' })
export class Apartments {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  @ApiProperty({
    description: 'Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  id: string;

  @Column('character varying', { name: 'nombre', length: 255 })
  @ApiProperty({ description: 'Nombre', example: 'Ejemplo' })
  nombre: string;

  @Column('text', { name: 'direccion', nullable: true })
  @ApiPropertyOptional({ description: 'Direccion', example: 'Ejemplo' })
  direccion: string | null;

  @Column('text', { name: 'descripcion', nullable: true })
  @ApiPropertyOptional({ description: 'Descripcion', example: 'Ejemplo' })
  descripcion: string | null;

  @Column('numeric', {
    name: 'ubicacion_lat',
    nullable: true,
    precision: 10,
    scale: 7,
    transformer: new ColumnNumericTransformer(),
  })
  @ApiPropertyOptional({ description: 'Ubicacion Lat', example: 19.432608 })
  ubicacionLat: number | null;

  @Column('numeric', {
    name: 'ubicacion_lng',
    nullable: true,
    precision: 10,
    scale: 7,
    transformer: new ColumnNumericTransformer(),
  })
  @ApiPropertyOptional({ description: 'Ubicacion Lng', example: -99.133209 })
  ubicacionLng: number | null;

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

  @OneToMany(() => Empleadas, (empleadas) => empleadas.apartment)
  @ApiProperty({
    description: 'Empleadas',
    type: () => [Empleadas],
    example: [],
  })
  empleadas: Empleadas[];
}
