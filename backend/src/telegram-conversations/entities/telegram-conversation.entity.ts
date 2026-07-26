import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Clientes } from '../../clients/entities/client.entity';
import { Servicios } from '../../services/entities/service.entity';
import { GroupServiceRequest } from '../../group-services/entities/group-service-request.entity';

@Index('idx_conversaciones_cliente', ['clienteId'], {})
@Index('idx_conversaciones_enviado_at', ['enviadoAt'], {})
@Index('conversaciones_telegram_pkey', ['id'], { unique: true })
@Index('idx_conversaciones_servicio', ['servicioId'], {})
@Entity('conversaciones_telegram', { schema: 'public' })
export class ConversacionesTelegram {
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

  @Column('uuid', { name: 'booking_session_id', nullable: true })
  bookingSessionId: string | null;

  @Column('uuid', { name: 'group_request_id', nullable: true })
  groupRequestId: string | null;

  @Column('enum', {
    name: 'emisor',
    enum: ['ia', 'jefe', 'cliente', 'sistema'],
  })
  @ApiProperty({
    description: 'Emisor',
    enum: ['ia', 'jefe', 'cliente', 'sistema'],
    example: 'ia',
  })
  emisor: 'ia' | 'jefe' | 'cliente' | 'sistema';

  @Column('text', { name: 'mensaje' })
  @ApiProperty({ description: 'Mensaje', example: 'Ejemplo' })
  mensaje: string;

  @Column('boolean', { name: 'ia_activa', default: () => 'true' })
  @ApiProperty({ description: 'Ia Activa', example: true })
  iaActiva: boolean;

  @Column('timestamp with time zone', {
    name: 'enviado_at',
    default: () => 'now()',
  })
  @ApiProperty({
    description: 'Enviado At',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  enviadoAt: Date;

  @ManyToOne(() => Clientes, (clientes) => clientes.conversacionesTelegrams, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'cliente_id', referencedColumnName: 'id' }])
  @ApiProperty({ description: 'Cliente', type: () => Clientes })
  cliente: Clientes;

  @ManyToOne(
    () => Servicios,
    (servicios) => servicios.conversacionesTelegrams,
    { onDelete: 'SET NULL' },
  )
  @JoinColumn([{ name: 'servicio_id', referencedColumnName: 'id' }])
  @ApiProperty({ description: 'Servicio', type: () => Servicios })
  servicio: Servicios | null;

  @ManyToOne(() => GroupServiceRequest, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn([{ name: 'group_request_id', referencedColumnName: 'id' }])
  groupRequest: GroupServiceRequest | null;
}
