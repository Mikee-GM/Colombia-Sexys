import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, OneToMany, OneToOne } from 'typeorm';
import { AlertasClientes } from '../../client-alerts/entities/client-alert.entity';
import { Choferes } from '../../drivers/entities/driver.entity';
import { Empleadas } from '../../employees/entities/employee.entity';
import { ExtrasServicio } from '../../service-extras/entities/service-extra.entity';
import { Servicios } from '../../services/entities/service.entity';

@Index('usuarios_email_key', ['email'], { unique: true })
@Index('usuarios_pkey', ['id'], { unique: true })
@Index('idx_usuarios_rol', ['rol'], {})
@Index('usuarios_telegram_chat_id_key', ['telegramChatId'], { unique: true })
@Entity('usuarios', { schema: 'public' })
export class Usuarios {
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

  @Column('character varying', { name: 'email', unique: true, length: 255 })
  @ApiProperty({ description: 'Email', example: 'usuario@example.com' })
  email: string;

  @Column('text', { name: 'password_hash' })
  @ApiProperty({ description: 'Password Hash', example: 'Ejemplo' })
  passwordHash: string;

  @Column('enum', {
    name: 'rol',
    enum: ['jefe', 'empleada', 'chofer', 'admin'],
  })
  @ApiProperty({
    description: 'Rol',
    enum: ['jefe', 'empleada', 'chofer', 'admin'],
    example: 'jefe',
  })
  rol: 'jefe' | 'empleada' | 'chofer' | 'admin';

  @Column('character varying', { name: 'nombre', nullable: true, length: 255 })
  @ApiPropertyOptional({ description: 'Nombre', example: 'Juan' })
  nombre: string | null;

  @Column('character varying', {
    name: 'apellido',
    nullable: true,
    length: 255,
  })
  @ApiPropertyOptional({ description: 'Apellido', example: 'Pérez' })
  apellido: string | null;

  @Column('boolean', { name: 'activo', default: () => 'true' })
  @ApiProperty({ description: 'Activo', example: true })
  activo: boolean;

  @Column('boolean', { name: 'disponible', default: () => 'true' })
  @ApiProperty({
    description: 'Disponible (para jefes/choferes)',
    example: true,
  })
  disponible: boolean;

  @Column('bigint', { name: 'telegram_chat_id', nullable: true, unique: true })
  @ApiPropertyOptional({
    description: 'Telegram Chat Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  telegramChatId: string | null;

  @Column('bigint', { name: 'grupo_telegram_id', nullable: true })
  @ApiPropertyOptional({
    description: 'Grupo Telegram Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  grupoTelegramId: string | null;

  @Column('character varying', {
    name: 'telegram_verification_code',
    nullable: true,
    length: 255,
  })
  @ApiPropertyOptional({
    description: 'Telegram Verification Code',
    example: 'Ejemplo',
  })
  telegramVerificationCode: string | null;

  @Column('timestamp with time zone', {
    name: 'telegram_verification_expires_at',
    nullable: true,
  })
  @ApiPropertyOptional({
    description: 'Telegram Verification Expires At',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  telegramVerificationExpiresAt: Date | null;

  @Column('character varying', { name: 'telefono', nullable: true, length: 50 })
  @ApiPropertyOptional({ description: 'Telefono', example: '+525512345678' })
  telefono: string | null;

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

  @Column('timestamp with time zone', { name: 'last_login_at', nullable: true })
  @ApiPropertyOptional({
    description: 'Last Login At',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  lastLoginAt: Date | null;

  @OneToMany(
    () => AlertasClientes,
    (alertasClientes) => alertasClientes.atendidaPor,
  )
  @ApiProperty({
    description: 'Alertas Clientes',
    type: () => [AlertasClientes],
    example: [],
  })
  alertasClientes: AlertasClientes[];

  @OneToOne(() => Choferes, (choferes) => choferes.usuario)
  @ApiProperty({ description: 'Choferes', type: () => Choferes })
  choferes: Choferes;

  @OneToOne(() => Empleadas, (empleadas) => empleadas.usuario)
  @ApiProperty({ description: 'Empleadas', type: () => Empleadas })
  empleadas: Empleadas;

  @OneToMany(
    () => ExtrasServicio,
    (extrasServicio) => extrasServicio.registradoPor,
  )
  @ApiProperty({
    description: 'Extras Servicios',
    type: () => [ExtrasServicio],
    example: [],
  })
  extrasServicios: ExtrasServicio[];

  @OneToMany(() => Servicios, (servicios) => servicios.jefe)
  @ApiProperty({
    description: 'Servicios',
    type: () => [Servicios],
    example: [],
  })
  servicios: Servicios[];
}
