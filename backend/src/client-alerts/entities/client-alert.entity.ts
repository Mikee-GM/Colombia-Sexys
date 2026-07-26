import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Usuarios } from '../../users/entities/user.entity';
import { Clientes } from '../../clients/entities/client.entity';
import { Servicios } from '../../services/entities/service.entity';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';

@Index('idx_alertas_atendida', ['atendida'], {})
@Index('idx_alertas_cliente', ['clienteId'], {})
@Index('alertas_clientes_pkey', ['id'], { unique: true })
@Index('idx_alertas_servicio', ['servicioId'], {})
@Entity('alertas_clientes', { schema: 'public' })
export class AlertasClientes {
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

  @Column('uuid', { name: 'cliente_id' })
  @ApiProperty({
    description: 'Cliente Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  clienteId: string;

  @Column('uuid', { name: 'servicio_id', nullable: true })
  @ApiPropertyOptional({
    description: 'Servicio Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  servicioId: string | null;

  @Column('text', { name: 'mensaje_original' })
  @ApiProperty({ description: 'Mensaje Original', example: 'Ejemplo' })
  mensajeOriginal: string;

  @Column('character varying', { name: 'emocion_detectada', length: 50 })
  @ApiProperty({ description: 'Emocion Detectada', example: 'Ejemplo' })
  emocionDetectada: string;

  @Column('numeric', {
    name: 'score_sentimiento',
    precision: 4,
    scale: 3,
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({ description: 'Score Sentimiento', example: 0.5 })
  scoreSentimiento: number;

  @Column('boolean', { name: 'atendida', default: () => 'false' })
  @ApiProperty({ description: 'Atendida', example: true })
  atendida: boolean;

  @Column('timestamp with time zone', { name: 'atendida_at', nullable: true })
  @ApiPropertyOptional({
    description: 'Atendida At',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  atendidaAt: Date | null;

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

  @ManyToOne(() => Usuarios, (usuarios) => usuarios.alertasClientes, {
    onDelete: 'SET NULL',
  })
  @JoinColumn([{ name: 'atendida_por', referencedColumnName: 'id' }])
  @ApiProperty({ description: 'Atendida Por', type: () => Usuarios })
  atendidaPor: Usuarios;

  @ManyToOne(() => Clientes, (clientes) => clientes.alertasClientes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'cliente_id', referencedColumnName: 'id' }])
  @ApiProperty({ description: 'Cliente', type: () => Clientes })
  cliente: Clientes;

  @ManyToOne(() => Servicios, (servicios) => servicios.alertasClientes, {
    onDelete: 'SET NULL',
  })
  @JoinColumn([{ name: 'servicio_id', referencedColumnName: 'id' }])
  @ApiProperty({ description: 'Servicio', type: () => Servicios })
  servicio: Servicios;
}
