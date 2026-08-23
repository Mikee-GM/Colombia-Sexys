import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Intentos fallidos de `/vincular` por chat de Telegram.
 *
 * El codigo son seis digitos y vive diez minutos: sin un limite de intentos, un
 * script puede recorrer el espacio entero y engancharse a una cuenta ajena. El
 * `ThrottlerGuard` global del backend no cubre esto, porque es un guard HTTP y
 * los updates de Telegram no pasan por el.
 */
@Entity('telegram_link_attempts')
export class TelegramLinkAttempt {
  @PrimaryColumn('varchar', { name: 'telegram_chat_id', length: 64 })
  telegramChatId: string;

  @Column('integer', { default: 0 })
  attempts: number;

  @Column('timestamp with time zone', { name: 'blocked_until', nullable: true })
  blockedUntil: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
