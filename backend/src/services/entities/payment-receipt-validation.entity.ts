import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Servicios } from './service.entity';

@Entity('payment_receipt_validations')
export class PaymentReceiptValidations {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty({ description: 'ID de la validación', format: 'uuid' })
  id: string;

  @Column({ name: 'fecha_recepcion', type: 'date', nullable: true })
  @ApiPropertyOptional({ description: 'Fecha en que se recibió el comprobante' })
  fechaRecepcion?: Date;

  @Column({ name: 'hora_recepcion', type: 'varchar', length: 10, nullable: true })
  @ApiPropertyOptional({ description: 'Hora en que se recibió el comprobante' })
  horaRecepcion?: string;

  @Column({ name: 'cliente_telegram', type: 'varchar', length: 255, nullable: true })
  @ApiPropertyOptional({ description: 'Nombre del cliente en Telegram' })
  clienteTelegram?: string;

  @Column({ name: 'chat_id', type: 'varchar', length: 50, nullable: true })
  @ApiPropertyOptional({ description: 'Chat ID de Telegram del cliente' })
  chatId?: string;

  @Column({ name: 'es_comprobante', type: 'boolean', default: false })
  @ApiProperty({ description: 'Si la IA identificó que la imagen es un comprobante de pago' })
  esComprobante: boolean;

  @Column({ name: 'banco_origen', type: 'varchar', length: 100, nullable: true })
  @ApiPropertyOptional({ description: 'Banco de origen extraído del comprobante' })
  bancoOrigen?: string;

  @Column({ name: 'banco_destino', type: 'varchar', length: 100, nullable: true })
  @ApiPropertyOptional({ description: 'Banco de destino extraído del comprobante' })
  bancoDestino?: string;

  @Column({ name: 'titular_destino', type: 'varchar', length: 255, nullable: true })
  @ApiPropertyOptional({ description: 'Nombre del beneficiario (titular destino)' })
  titularDestino?: string;

  @Column({ name: 'cuenta_destino', type: 'varchar', length: 50, nullable: true })
  @ApiPropertyOptional({ description: 'Cuenta destino u ocultada (ej. **733)' })
  cuentaDestino?: string;

  @Column({ name: 'clabe', type: 'varchar', length: 18, nullable: true })
  @ApiPropertyOptional({ description: 'CLABE interbancaria destino' })
  clabe?: string;

  @Column({ name: 'monto', type: 'decimal', precision: 10, scale: 2, nullable: true })
  @ApiPropertyOptional({ description: 'Monto transferido' })
  monto?: number;

  @Column({ name: 'fecha_transferencia', type: 'varchar', length: 50, nullable: true })
  @ApiPropertyOptional({ description: 'Fecha de la transferencia reportada en el comprobante' })
  fechaTransferencia?: string;

  @Column({ name: 'hora_transferencia', type: 'varchar', length: 20, nullable: true })
  @ApiPropertyOptional({ description: 'Hora de la transferencia reportada en el comprobante' })
  horaTransferencia?: string;

  @Column({ name: 'referencia', type: 'varchar', length: 50, nullable: true })
  @ApiPropertyOptional({ description: 'Referencia alfanumérica de la transferencia' })
  referencia?: string;

  @Column({ name: 'folio', type: 'varchar', length: 50, nullable: true })
  @ApiPropertyOptional({ description: 'Folio o número de operación' })
  folio?: string;

  @Column({ name: 'id_spei', type: 'varchar', length: 100, nullable: true })
  @ApiPropertyOptional({ description: 'Clave de rastreo o ID SPEI' })
  idSpei?: string;

  @Column({ name: 'concepto', type: 'varchar', length: 255, nullable: true })
  @ApiPropertyOptional({ description: 'Concepto de pago' })
  concepto?: string;

  @Column({ name: 'confianza', type: 'int', nullable: true })
  @ApiPropertyOptional({ description: 'Porcentaje de confianza de la lectura por IA' })
  confianza?: number;

  @Column({ name: 'estado', type: 'varchar', length: 50, nullable: true })
  @ApiPropertyOptional({ description: 'Estado de validación (APROBADO, CUENTA_NO_AUTORIZADA, etc.)' })
  estado?: string;

  @Column({ name: 'observaciones', type: 'text', nullable: true })
  @ApiPropertyOptional({ description: 'Observaciones sobre el rechazo o fraude' })
  observaciones?: string;

  @Column({ name: 'json_ia', type: 'jsonb', nullable: true })
  @ApiPropertyOptional({ description: 'Respuesta completa de la IA en formato JSON' })
  jsonIA?: any;

  @ManyToOne(() => Servicios, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'servicio_id' })
  servicio?: Servicios;

  @Column({ name: 'servicio_id', type: 'uuid', nullable: true })
  servicioId?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
