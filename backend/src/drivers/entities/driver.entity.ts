import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { Usuarios } from '../../users/entities/user.entity';
import { Viajes } from '../../trips/entities/trip.entity';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';

@Index('idx_choferes_disponible', ['disponible'], {})
@Index('choferes_pkey', ['id'], { unique: true })
@Index('choferes_usuario_id_key', ['usuarioId'], { unique: true })
@Entity('choferes', { schema: 'public' })
export class Choferes {
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

  @Column('uuid', { name: 'usuario_id', unique: true })
  @ApiProperty({
    description: 'Usuario Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  usuarioId: string;

  @Column('character varying', { name: 'nombre', length: 255 })
  @ApiProperty({ description: 'Nombre', example: 'Ejemplo' })
  nombre: string;

  @Column('character varying', { name: 'telefono', length: 30 })
  @ApiProperty({ description: 'Telefono', example: '+525512345678' })
  telefono: string;

  @Column('boolean', { name: 'disponible', default: () => 'false' })
  @ApiProperty({ description: 'Disponible', example: true })
  disponible: boolean;

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
    name: 'ultima_ubicacion_at',
    nullable: true,
  })
  @ApiPropertyOptional({
    description: 'Ultima Ubicacion At',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  ultimaUbicacionAt: Date | null;

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

  @Column('character varying', {
    name: 'vehiculo_marca',
    length: 255,
    nullable: true,
  })
  @ApiPropertyOptional({ description: 'Vehiculo Marca', example: 'Ejemplo' })
  vehiculoMarca: string | null;

  @Column('character varying', {
    name: 'vehiculo_modelo',
    length: 255,
    nullable: true,
  })
  @ApiPropertyOptional({ description: 'Vehiculo Modelo', example: 'Ejemplo' })
  vehiculoModelo: string | null;

  @Column('character varying', {
    name: 'vehiculo_color',
    length: 255,
    nullable: true,
  })
  @ApiPropertyOptional({ description: 'Vehiculo Color', example: 'Ejemplo' })
  vehiculoColor: string | null;

  @Column('character varying', {
    name: 'vehiculo_placa',
    length: 50,
    nullable: true,
  })
  @ApiPropertyOptional({ description: 'Vehiculo Placa', example: 'Ejemplo' })
  vehiculoPlaca: string | null;

  @OneToOne(() => Usuarios, (usuarios) => usuarios.choferes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'usuario_id', referencedColumnName: 'id' }])
  @ApiProperty({ description: 'Usuario', type: () => Usuarios })
  usuario: Usuarios;

  @OneToMany(() => Viajes, (viajes) => viajes.chofer)
  @ApiProperty({ description: 'Viajes', type: () => [Viajes], example: [] })
  viajes: Viajes[];
}
