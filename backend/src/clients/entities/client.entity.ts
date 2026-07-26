import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, Index, OneToMany, OneToOne } from 'typeorm';
import { AlertasClientes } from '../../client-alerts/entities/client-alert.entity';
import { ConversacionesTelegram } from '../../telegram-conversations/entities/telegram-conversation.entity';
import { Servicios } from '../../services/entities/service.entity';
import { ClientMembership } from '../../loyalty/entities/client-membership.entity';
import { LoyaltyTransaction } from '../../loyalty/entities/loyalty-transaction.entity';

@Index('clientes_pkey', ['id'], { unique: true })
@Index('clientes_telegram_chat_id_key', ['telegramChatId'], { unique: true })
@Entity('clientes', { schema: 'public' })
export class Clientes {
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

  @Column('bigint', { name: 'telegram_chat_id', unique: true })
  @ApiProperty({
    description: 'Telegram Chat Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  telegramChatId: string;

  @Column('integer', { name: 'ai_calls_today', default: 0 })
  @ApiProperty({ description: 'AI calls made today', example: 0 })
  aiCallsToday: number;

  @Column('timestamp with time zone', {
    name: 'last_ai_call_at',
    nullable: true,
  })
  @ApiPropertyOptional({
    description: 'Last time AI was called',
    type: String,
    format: 'date-time',
  })
  lastAiCallAt: Date | null;

  @Column('character varying', {
    name: 'nombre_telegram',
    nullable: true,
    length: 255,
  })
  @ApiPropertyOptional({ description: 'Nombre Telegram', example: 'Ejemplo' })
  nombreTelegram: string | null;

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
    name: 'primer_contacto_at',
    default: () => 'now()',
  })
  @ApiProperty({
    description: 'Primer Contacto At',
    type: String,
    format: 'date-time',
    example: '2026-07-09T12:00:00.000Z',
  })
  primerContactoAt: Date;

  @OneToMany(
    () => AlertasClientes,
    (alertasClientes) => alertasClientes.cliente,
  )
  @ApiProperty({
    description: 'Alertas Clientes',
    type: () => [AlertasClientes],
    example: [],
  })
  alertasClientes: AlertasClientes[];

  @OneToMany(
    () => ConversacionesTelegram,
    (conversacionesTelegram) => conversacionesTelegram.cliente,
  )
  @ApiProperty({
    description: 'Conversaciones Telegrams',
    type: () => [ConversacionesTelegram],
    example: [],
  })
  conversacionesTelegrams: ConversacionesTelegram[];

  @OneToMany(() => Servicios, (servicios) => servicios.cliente)
  @ApiProperty({
    description: 'Servicios',
    type: () => [Servicios],
    example: [],
  })
  servicios: Servicios[];

  @OneToMany(
    () => LoyaltyTransaction,
    (loyaltyTransaction) => loyaltyTransaction.cliente,
  )
  @ApiProperty({
    description: 'Loyalty Transactions',
    type: () => [LoyaltyTransaction],
    example: [],
  })
  loyaltyTransactions: LoyaltyTransaction[];

  @OneToOne(() => ClientMembership, (membership) => membership.cliente)
  @ApiProperty({ description: 'Membership', type: () => ClientMembership })
  membership: ClientMembership;
}
