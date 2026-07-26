import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { AlertasClientes } from '../../client-alerts/entities/client-alert.entity';
import { ConversacionesTelegram } from '../../telegram-conversations/entities/telegram-conversation.entity';
import { ExtensionesServicio } from '../../service-extensions/entities/service-extension.entity';
import { ExtrasServicio } from '../../service-extras/entities/service-extra.entity';
import { Prorrogas } from '../../extensions/entities/extension.entity';
import { Clientes } from '../../clients/entities/client.entity';
import { Empleadas } from '../../employees/entities/employee.entity';
import { Usuarios } from '../../users/entities/user.entity';
import { Viajes } from '../../trips/entities/trip.entity';
import { LoyaltyTransaction } from '../../loyalty/entities/loyalty-transaction.entity';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';
import { ServiceParticipant } from '../../group-services/entities/service-participant.entity';
import { ServicePayment } from '../../group-services/entities/service-payment.entity';

@Index('idx_servicios_cliente', ['clienteId'], {})
@Index('idx_servicios_created_at', ['createdAt'], {})
@Index('idx_servicios_empleada', ['empleadaId'], {})
@Index('idx_servicios_estado', ['estado'], {})
@Index('servicios_pkey', ['id'], { unique: true })
@Index('idx_servicios_jefe', ['jefeId'], {})
@Entity('servicios', { schema: 'public' })
export class Servicios {
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

  @Column('varchar', { name: 'service_type', length: 20, default: 'individual' })
  @ApiProperty({ enum: ['individual', 'grupal'] })
  serviceType: 'individual' | 'grupal';

  @Column('uuid', { name: 'empleada_id' })
  @ApiProperty({
    description: 'Empleada Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  empleadaId: string;

  @Column('uuid', { name: 'cliente_id' })
  @ApiProperty({
    description: 'Cliente Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  clienteId: string;

  @Column('uuid', { name: 'jefe_id' })
  @ApiProperty({
    description: 'Jefe Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  jefeId: string;

  @Column('enum', {
    name: 'metodo_pago',
    enum: ['efectivo', 'tarjeta', 'transferencia', 'mixto'],
  })
  @ApiProperty({
    description: 'Metodo Pago',
    enum: ['efectivo', 'tarjeta', 'transferencia', 'mixto'],
    example: 'efectivo',
  })
  metodoPago: 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto';

  @Column('numeric', {
    name: 'duracion_pactada_horas',
    precision: 4,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({ description: 'Duracion Pactada Horas', example: 1200.0 })
  duracionPactadaHoras: number;

  @Column('numeric', {
    name: 'duracion_final_horas',
    nullable: true,
    precision: 4,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  @ApiPropertyOptional({
    description: 'Duracion Final Horas',
    example: 1200.0,
  })
  duracionFinalHoras: number | null;

  @Column('numeric', {
    name: 'ubicacion_cliente_lat',
    precision: 10,
    scale: 7,
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({ description: 'Ubicacion Cliente Lat', example: 19.432608 })
  ubicacionClienteLat: number;

  @Column('numeric', {
    name: 'ubicacion_cliente_lng',
    precision: 10,
    scale: 7,
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({ description: 'Ubicacion Cliente Lng', example: -99.133209 })
  ubicacionClienteLng: number;

  @Column('numeric', {
    name: 'precio_base_hora_pactado',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({ description: 'Precio Base Hora Pactado', example: 1200.0 })
  precioBaseHoraPactado: number;

  @Column('numeric', {
    name: 'total_base',
    precision: 10,
    scale: 2,
    default: () => '0',
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({ description: 'Total Base', example: 1200.0 })
  totalBase: number;

  @Column('numeric', {
    name: 'total_extras',
    precision: 10,
    scale: 2,
    default: () => '0',
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({ description: 'Total Extras', example: 1200.0 })
  totalExtras: number;

  @Column('numeric', {
    name: 'total_final',
    precision: 10,
    scale: 2,
    default: () => '0',
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({ description: 'Total Final', example: 1200.0 })
  totalFinal: number;

  @Column('numeric', {
    name: 'total_paid',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  totalPaid: number;

  @Column('numeric', {
    name: 'pending_balance',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  pendingBalance: number;

  @Column('numeric', {
    name: 'transport_fee_snapshot',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  transportFeeSnapshot: number;

  @Column('numeric', {
    name: 'manual_transport_adjustment',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  manualTransportAdjustment: number;

  @Column('numeric', {
    name: 'pending_duration_hours',
    precision: 4,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  pendingDurationHours: number | null;

  @Column('numeric', {
    name: 'total_transporte',
    precision: 10,
    scale: 2,
    default: () => '0',
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({ description: 'Total de transporte', example: 100.0 })
  totalTransporte: number;

  @Column('uuid', { name: 'preset_location_id', nullable: true })
  presetLocationId: string | null;

  @Column('varchar', {
    name: 'location_name_snapshot',
    length: 80,
    nullable: true,
  })
  locationNameSnapshot: string | null;

  @Column('varchar', {
    name: 'location_address_snapshot',
    length: 240,
    nullable: true,
  })
  locationAddressSnapshot: string | null;

  @Column('numeric', {
    name: 'customer_transport_charge',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: new ColumnNumericTransformer(),
  })
  customerTransportCharge: number | null;

  @Column('numeric', {
    name: 'actual_transport_cost',
    precision: 10,
    scale: 2,
    default: 0,
    transformer: new ColumnNumericTransformer(),
  })
  actualTransportCost: number;

  @Column('varchar', {
    name: 'estado_liquidacion',
    length: 30,
    default: () => "'cerrada'",
  })
  @ApiProperty({
    description: 'Estado de la liquidación del transporte',
    enum: ['transporte_pendiente', 'cerrada'],
  })
  estadoLiquidacion: 'transporte_pendiente' | 'cerrada';

  @Column('varchar', {
    name: 'telegram_resumen_definitivo_id',
    nullable: true,
  })
  @ApiPropertyOptional({ description: 'Mensaje definitivo del cliente' })
  telegramResumenDefinitivoId: string | null;

  @Column('smallint', { name: 'recordatorios_regreso', default: () => '0' })
  @ApiProperty({ description: 'Recordatorios de transporte de regreso' })
  recordatoriosRegreso: number;

  @Column('timestamp with time zone', {
    name: 'proximo_recordatorio_regreso_at',
    nullable: true,
  })
  @ApiPropertyOptional({ description: 'Próximo recordatorio de regreso' })
  proximoRecordatorioRegresoAt: Date | null;

  @Column('timestamp with time zone', {
    name: 'hora_inicio_servicio',
    nullable: true,
  })
  @ApiPropertyOptional({
    description: 'Hora Inicio Servicio',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  horaInicioServicio: Date | null;

  @Column('timestamp with time zone', {
    name: 'hora_fin_servicio',
    nullable: true,
  })
  @ApiPropertyOptional({
    description: 'Hora Fin Servicio',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  horaFinServicio: Date | null;

  @Column('timestamp with time zone', {
    name: 'hora_llegada_casa',
    nullable: true,
  })
  @ApiPropertyOptional({
    description: 'Hora Llegada Casa',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  horaLlegadaCasa: Date | null;

  @Column('smallint', { name: 'prorrogas_usadas', default: () => '0' })
  @ApiProperty({ description: 'Prorrogas Usadas', example: 1 })
  prorrogasUsadas: number;

  @Column('enum', {
    name: 'estado',
    enum: ['pendiente', 'agendado', 'en_curso', 'finalizado', 'cancelado'],
    default: 'pendiente',
  })
  @ApiProperty({
    description: 'Estado',
    enum: ['pendiente', 'agendado', 'en_curso', 'finalizado', 'cancelado'],
    example: 'pendiente',
  })
  estado: 'pendiente' | 'agendado' | 'en_curso' | 'finalizado' | 'cancelado';

  @Column('uuid', { name: 'servicio_previo_id', nullable: true })
  servicioPrevioId: string | null;

  @Column('timestamp with time zone', {
    name: 'hora_disponibilidad_estimada',
    nullable: true,
  })
  horaDisponibilidadEstimada: Date | null;

  @Column('timestamp with time zone', {
    name: 'hora_inicio_estimada',
    nullable: true,
  })
  horaInicioEstimada: Date | null;

  @Column('varchar', {
    name: 'transporte_agendado',
    length: 10,
    nullable: true,
  })
  transporteAgendado: 'chofer' | 'uber' | null;

  @Column('text', { name: 'notas', nullable: true })
  @ApiPropertyOptional({ description: 'Notas', example: 'Ejemplo' })
  notas: string | null;

  @Column('text', { name: 'notas_jefe', nullable: true })
  notasJefe: string | null;

  @Column('varchar', { name: 'telegram_cliente_mensaje_id', nullable: true })
  @ApiPropertyOptional({
    description: 'Telegram Cliente Mensaje Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  telegramClienteMensajeId: string | null;

  @Column('varchar', { name: 'telegram_empleada_mensaje_id', nullable: true })
  @ApiPropertyOptional({
    description: 'Telegram Empleada Mensaje Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  telegramEmpleadaMensajeId: string | null;

  @Column('bigint', { name: 'cliente_telegram_id', nullable: true })
  @ApiPropertyOptional({
    description: 'Cliente Telegram Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  clienteTelegramId: string | null;

  @Column('boolean', { name: 'ia_activa', default: true })
  @ApiProperty({ description: 'Ia Activa', example: true })
  iaActiva: boolean;

  @Column('bigint', { name: 'telegram_thread_id', nullable: true })
  @ApiPropertyOptional({
    description: 'Telegram Thread Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  telegramThreadId: string | null;

  @Column('integer', { name: 'calificacion', nullable: true })
  @ApiPropertyOptional({ description: 'Calificacion', example: 1 })
  calificacion: number | null;

  @Column('text', { name: 'comentarios_calificacion', nullable: true })
  @ApiPropertyOptional({
    description: 'Comentarios Calificacion',
    example: 'Ejemplo',
  })
  comentariosCalificacion: string | null;

  @Column('boolean', {
    name: 'notificacion_extension_enviada',
    default: false,
  })
  @ApiProperty({ description: 'Notificacion Extension Enviada', example: true })
  notificacionExtensionEnviada: boolean;

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

  @Column('timestamp with time zone', {
    name: 'updated_at',
    default: () => 'now()',
  })
  @ApiProperty({
    description: 'Updated At',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  updatedAt: Date;

  @OneToMany(
    () => AlertasClientes,
    (alertasClientes) => alertasClientes.servicio,
  )
  @ApiProperty({
    description: 'Alertas Clientes',
    type: () => [AlertasClientes],
    example: [],
  })
  alertasClientes: AlertasClientes[];

  @OneToMany(
    () => ConversacionesTelegram,
    (conversacionesTelegram) => conversacionesTelegram.servicio,
  )
  @ApiProperty({
    description: 'Conversaciones Telegrams',
    type: () => [ConversacionesTelegram],
    example: [],
  })
  conversacionesTelegrams: ConversacionesTelegram[];

  @OneToMany(
    () => ExtensionesServicio,
    (extensionesServicio) => extensionesServicio.servicio,
  )
  @ApiProperty({
    description: 'Extensiones Servicios',
    type: () => [ExtensionesServicio],
    example: [],
  })
  extensionesServicios: ExtensionesServicio[];

  @OneToMany(() => ExtrasServicio, (extrasServicio) => extrasServicio.servicio)
  @ApiProperty({
    description: 'Extras Servicios',
    type: () => [ExtrasServicio],
    example: [],
  })
  extrasServicios: ExtrasServicio[];

  @OneToMany(() => Prorrogas, (prorrogas) => prorrogas.servicio)
  @ApiProperty({
    description: 'Prorrogases',
    type: () => [Prorrogas],
    example: [],
  })
  prorrogases: Prorrogas[];

  @ManyToOne(() => Clientes, (clientes) => clientes.servicios, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn([{ name: 'cliente_id', referencedColumnName: 'id' }])
  @ApiProperty({ description: 'Cliente', type: () => Clientes })
  cliente: Clientes;

  @ManyToOne(() => Empleadas, (empleadas) => empleadas.servicios, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn([{ name: 'empleada_id', referencedColumnName: 'id' }])
  @ApiProperty({ description: 'Empleada', type: () => Empleadas })
  empleada: Empleadas;

  @ManyToOne(() => Usuarios, (usuarios) => usuarios.servicios, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn([{ name: 'jefe_id', referencedColumnName: 'id' }])
  @ApiProperty({ description: 'Jefe', type: () => Usuarios })
  jefe: Usuarios;

  @OneToMany(() => Viajes, (viajes) => viajes.servicio)
  @ApiProperty({ description: 'Viajes', type: () => [Viajes], example: [] })
  viajes: Viajes[];

  @OneToMany(
    () => ServiceParticipant,
    (participant) => participant.service,
  )
  @ApiProperty({ type: () => [ServiceParticipant] })
  participantes: ServiceParticipant[];

  @OneToMany(() => ServicePayment, (payment) => payment.service)
  @ApiProperty({ type: () => [ServicePayment] })
  pagos: ServicePayment[];

  @OneToMany(
    () => LoyaltyTransaction,
    (loyaltyTransaction) => loyaltyTransaction.servicio,
  )
  @ApiProperty({
    description: 'Loyalty Transactions',
    type: () => [LoyaltyTransaction],
    example: [],
  })
  loyaltyTransactions: LoyaltyTransaction[];
}
