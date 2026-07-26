import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Choferes } from '../../drivers/entities/driver.entity';
import { Servicios } from '../../services/entities/service.entity';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';
import { TripPassenger } from '../../group-services/entities/trip-passenger.entity';

@Index('idx_viajes_chofer', ['choferId'], {})
@Index('idx_viajes_estado', ['estado'], {})
@Index('viajes_pkey', ['id'], { unique: true })
@Index(
  'idx_viajes_servicio_tipo_unidad_key',
  ['servicioId', 'tipo', 'unitNumber'],
  { unique: true },
)
@Index('idx_viajes_servicio', ['servicioId'], {})
@Entity('viajes', { schema: 'public' })
export class Viajes {
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

  @Column('uuid', { name: 'chofer_id', nullable: true })
  @ApiPropertyOptional({
    description: 'Chofer Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  choferId: string | null;

  @Column('enum', { name: 'tipo', enum: ['ida', 'regreso'] })
  @ApiProperty({
    description: 'Tipo',
    enum: ['ida', 'regreso'],
    example: 'ida',
  })
  tipo: 'ida' | 'regreso';

  @Column('smallint', { name: 'unit_number', default: 1 })
  @ApiProperty({ description: 'Número de unidad dentro del sentido', example: 1 })
  unitNumber: number;

  @Column('enum', {
    name: 'zona',
    enum: ['montecarlo', 'majestic', 'domicilio'],
  })
  @ApiProperty({
    description: 'Zona',
    enum: ['montecarlo', 'majestic', 'domicilio'],
    example: 'montecarlo',
  })
  zona: 'montecarlo' | 'majestic' | 'domicilio';

  @Column('numeric', {
    name: 'tarifa',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({ description: 'Tarifa', example: 1200.0 })
  tarifa: number;

  @Column('enum', {
    name: 'estado',
    enum: [
      'notificado',
      'aceptado',
      'en_camino',
      'llegado',
      'en_curso',
      'finalizado',
      'rechazado',
      'cancelado',
    ],
    default: 'notificado',
  })
  @ApiProperty({
    description: 'Estado',
    enum: [
      'notificado',
      'aceptado',
      'en_camino',
      'llegado',
      'en_curso',
      'finalizado',
      'rechazado',
      'cancelado',
    ],
    example: 'notificado',
  })
  estado:
    | 'notificado'
    | 'aceptado'
    | 'en_camino'
    | 'llegado'
    | 'en_curso'
    | 'finalizado'
    | 'rechazado'
    | 'cancelado';

  @Column('character varying', {
    name: 'proveedor_transporte',
    length: 50,
    default: () => "'interno'",
  })
  @ApiProperty({
    description: 'Proveedor de transporte del viaje (interno o uber)',
    example: 'interno',
  })
  proveedorTransporte: string;

  @Column('varchar', { name: 'telegram_uber_file_id', nullable: true })
  @ApiPropertyOptional({ description: 'File ID de la captura de Uber' })
  telegramUberFileId: string | null;

  @Column('numeric', { name: 'driver_payout', precision: 10, scale: 2, default: 0, transformer: new ColumnNumericTransformer() })
  driverPayout: number;

  @Column('timestamp with time zone', { name: 'fare_confirmed_at', nullable: true })
  fareConfirmedAt: Date | null;

  @Column('uuid', { name: 'fare_confirmed_by_user_id', nullable: true })
  fareConfirmedByUserId: string | null;

  @Column('boolean', { name: 'fare_confirmation_override', default: false })
  fareConfirmationOverride: boolean;

  @Column('uuid', { name: 'driver_settlement_id', nullable: true })
  driverSettlementId: string | null;

  @Column('timestamp with time zone', {
    name: 'hora_notificacion',
    default: () => 'now()',
  })
  @ApiProperty({
    description: 'Hora Notificacion',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  horaNotificacion: Date;

  @Column('timestamp with time zone', {
    name: 'hora_aceptacion',
    nullable: true,
  })
  @ApiPropertyOptional({
    description: 'Hora Aceptacion',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  horaAceptacion: Date | null;

  @Column('timestamp with time zone', {
    name: 'hora_inicio_viaje',
    nullable: true,
  })
  @ApiPropertyOptional({
    description: 'Hora Inicio Viaje',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  horaInicioViaje: Date | null;

  @Column('timestamp with time zone', {
    name: 'hora_fin_viaje',
    nullable: true,
  })
  @ApiPropertyOptional({
    description: 'Hora Fin Viaje',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  horaFinViaje: Date | null;

  @Column('varchar', {
    name: 'telegram_empleada_msg_chofer_camino_id',
    nullable: true,
  })
  @ApiPropertyOptional({
    description: 'Telegram Empleada Msg Chofer Camino Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  telegramEmpleadaMsgChoferCaminoId: string | null;

  @Column('varchar', {
    name: 'telegram_empleada_msg_chofer_llegado_id',
    nullable: true,
  })
  @ApiPropertyOptional({
    description: 'Telegram Empleada Msg Chofer Llegado Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  telegramEmpleadaMsgChoferLlegadoId: string | null;

  @Column('jsonb', {
    name: 'choferes_notificados',
    default: () => "'[]'::jsonb",
  })
  @ApiProperty({
    description: 'Choferes Notificados',
    type: [String],
    example: [],
  })
  choferesNotificados: string[];

  @Column('varchar', {
    name: 'telegram_chofer_msg_oferta_id',
    nullable: true,
  })
  @ApiPropertyOptional({
    description: 'Telegram Chofer Msg Oferta Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  telegramChoferMsgOfertaId: string | null;

  @ManyToOne(() => Choferes, (choferes) => choferes.viajes, {
    onDelete: 'RESTRICT',
    nullable: true,
  })
  @JoinColumn([{ name: 'chofer_id', referencedColumnName: 'id' }])
  @ApiPropertyOptional({ description: 'Chofer', type: () => Choferes })
  chofer: Choferes | null;

  @ManyToOne(() => Servicios, (servicios) => servicios.viajes, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'servicio_id', referencedColumnName: 'id' }])
  @ApiProperty({ description: 'Servicio', type: () => Servicios })
  servicio: Servicios;

  @OneToMany(() => TripPassenger, (passenger) => passenger.trip)
  passengers: TripPassenger[];
}
