import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Empleadas } from '../../employees/entities/employee.entity';

export type EmployeeBotStatus =
  'pendiente' | 'activo' | 'error' | 'deshabilitado';

/**
 * Credenciales del bot de Telegram dedicado a una empleada.
 *
 * Vive en su propia tabla, no en `empleadas`, porque esa entidad se serializa
 * completa hacia el catálogo público en varios endpoints y el token nunca debe
 * poder salir por ahí.
 */
@Entity('employee_telegram_bots')
export class EmployeeTelegramBot {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  @ApiProperty({ description: 'Id' })
  id: string;

  @Index('idx_employee_telegram_bots_employee', { unique: true })
  @Column('uuid', { name: 'employee_id', unique: true })
  @ApiProperty({ description: 'Empleada dueña del bot' })
  employeeId: string;

  @ManyToOne(() => Empleadas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  empleada?: Empleadas;

  /** Token cifrado con AES-256-GCM (formato `iv:tag:ciphertext`, todo en base64). */
  @Column('text', { name: 'token_ciphertext' })
  tokenCiphertext: string;

  /** Últimos 4 caracteres del token, para poder mostrarlo enmascarado. */
  @Column('character varying', { name: 'token_hint', length: 8 })
  @ApiProperty({ description: 'Ultimos digitos del token', example: '4821' })
  tokenHint: string;

  @Column('bigint', { name: 'bot_id', nullable: true })
  @ApiPropertyOptional({ description: 'Id numerico del bot en Telegram' })
  botId: string | null;

  @Column('character varying', {
    name: 'bot_username',
    length: 64,
    nullable: true,
  })
  @ApiPropertyOptional({
    description: 'Username del bot',
    example: 'AuroraBot',
  })
  botUsername: string | null;

  @Column('character varying', {
    name: 'status',
    length: 20,
    default: 'pendiente',
  })
  @ApiProperty({ enum: ['pendiente', 'activo', 'error', 'deshabilitado'] })
  status: EmployeeBotStatus;

  @Column('text', { name: 'last_error', nullable: true })
  @ApiPropertyOptional({ description: 'Ultimo error al arrancar el bot' })
  lastError: string | null;

  /**
   * Secreto que Telegram devuelve en `X-Telegram-Bot-Api-Secret-Token` al llamar
   * al webhook. Permite descartar peticiones que no vengan de Telegram.
   */
  @Column('character varying', { name: 'webhook_secret', length: 64 })
  webhookSecret: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
