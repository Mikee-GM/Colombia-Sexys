import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Empleadas } from '../../employees/entities/employee.entity';
import { Usuarios } from '../../users/entities/user.entity';
import { Clientes } from '../../clients/entities/client.entity';
import { Servicios } from '../../services/entities/service.entity';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';

export type EstadoSolicitudManual = 'pendiente' | 'aprobada' | 'rechazada';

/**
 * Por que la empleada pide el registro.
 *
 * `pasado`: el servicio ya ocurrio y hay que dejarlo asentado para que entre al
 * corte. Nace ya finalizado.
 *
 * `inmediato`: acaba de cuadrar un cliente por su cuenta y necesita que el jefe
 * le abra el servicio ANTES de hacerlo, para que corra con su transporte y su
 * cierre normales. Nace pendiente de autorizacion, como cualquier reserva.
 */
export type TipoSolicitudManual = 'pasado' | 'inmediato';

/**
 * Un servicio que ocurrio fuera del sistema y hay que dejar registrado.
 *
 * Lo pide la empleada desde su chat y lo autoriza su jefe. Vive en su propia
 * tabla, y no como un servicio en estado "por aprobar", porque son dos cosas
 * distintas: aqui no hay reserva, ni viaje, ni cliente esperando: hay una
 * afirmacion sobre algo que ya paso y que alguien tiene que dar por buena. Al
 * aprobarse nace el servicio de verdad y esta fila queda como el rastro de
 * quien lo pidio, quien lo autorizo y por que.
 */
@Index('solicitudes_servicio_manual_pkey', ['id'], { unique: true })
@Entity('solicitudes_servicio_manual', { schema: 'public' })
export class SolicitudServicioManual {
  @Column('uuid', {
    primary: true,
    name: 'id',
    default: () => 'gen_random_uuid()',
  })
  @ApiProperty({ description: 'Id' })
  id: string;

  @Column('character varying', {
    name: 'tipo',
    length: 20,
    default: 'pasado',
  })
  @ApiProperty({
    description: 'Si el servicio ya ocurrió o está por hacerse',
    enum: ['pasado', 'inmediato'],
    example: 'pasado',
  })
  tipo: TipoSolicitudManual;

  @Column('uuid', { name: 'empleada_id' })
  @ApiProperty({ description: 'Empleada que lo registra' })
  empleadaId: string;

  @Column('uuid', { name: 'jefe_id' })
  @ApiProperty({ description: 'Jefe que debe autorizarlo' })
  jefeId: string;

  @Column('uuid', { name: 'cliente_id', nullable: true })
  @ApiPropertyOptional({ description: 'Cliente, si esta registrado' })
  clienteId: string | null;

  /** Como lo llamo la empleada cuando el cliente no esta en el sistema. */
  @Column('character varying', {
    name: 'cliente_nombre_libre',
    nullable: true,
    length: 255,
  })
  @ApiPropertyOptional({ description: 'Nombre del cliente sin registrar' })
  clienteNombreLibre: string | null;

  @Column('timestamp with time zone', { name: 'fecha_servicio' })
  @ApiProperty({ description: 'Cuando ocurrio el servicio', type: String })
  fechaServicio: Date;

  @Column('numeric', {
    name: 'duracion_horas',
    precision: 4,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({ description: 'Duracion en horas', example: 2 })
  duracionHoras: number;

  @Column('character varying', { name: 'metodo_pago', length: 20 })
  @ApiProperty({ description: 'Metodo de pago', example: 'efectivo' })
  metodoPago: 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto';

  @Column('numeric', {
    name: 'monto_cobrado',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({ description: 'Lo que se le cobro al cliente', example: 2400 })
  montoCobrado: number;

  @Column('character varying', {
    name: 'ubicacion',
    nullable: true,
    length: 255,
  })
  @ApiPropertyOptional({ description: 'Donde fue' })
  ubicacion: string | null;

  /** Por que no paso por el sistema. Es lo que el jefe lee para decidir. */
  @Column('text', { name: 'motivo' })
  @ApiProperty({
    description: 'Motivo por el que no se registro en su momento',
  })
  motivo: string;

  @Column('character varying', {
    name: 'estado',
    length: 20,
    default: 'pendiente',
  })
  @ApiProperty({ description: 'Estado', example: 'pendiente' })
  estado: EstadoSolicitudManual;

  @Column('uuid', { name: 'servicio_id', nullable: true })
  @ApiPropertyOptional({ description: 'Servicio creado al aprobarla' })
  servicioId: string | null;

  @Column('text', { name: 'nota_resolucion', nullable: true })
  @ApiPropertyOptional({ description: 'Nota de quien la resolvio' })
  notaResolucion: string | null;

  @Column('uuid', { name: 'resuelto_por_user_id', nullable: true })
  @ApiPropertyOptional({ description: 'Quien la resolvio' })
  resueltoPorUserId: string | null;

  @Column('timestamp with time zone', { name: 'resuelto_at', nullable: true })
  @ApiPropertyOptional({ description: 'Cuando se resolvio', type: String })
  resueltoAt: Date | null;

  @Column('timestamp with time zone', {
    name: 'created_at',
    default: () => 'now()',
  })
  @ApiProperty({ description: 'Creada el', type: String })
  createdAt: Date;

  @ManyToOne(() => Empleadas, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'empleada_id', referencedColumnName: 'id' }])
  empleada: Empleadas;

  @ManyToOne(() => Usuarios, { onDelete: 'NO ACTION' })
  @JoinColumn([{ name: 'jefe_id', referencedColumnName: 'id' }])
  jefe: Usuarios;

  @ManyToOne(() => Clientes, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn([{ name: 'cliente_id', referencedColumnName: 'id' }])
  cliente: Clientes | null;

  @ManyToOne(() => Servicios, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn([{ name: 'servicio_id', referencedColumnName: 'id' }])
  servicio: Servicios | null;
}
