import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type PushNotificationStatus = 'pending' | 'sent' | 'failed' | 'skipped';

/**
 * Registro durable de una intencion de aviso.
 *
 * La clave unica por usuario impide que un retry, un doble clic o dos caminos
 * que observen el mismo evento terminen enviando dos pushes. No contiene el
 * texto del aviso: asi el historial de entrega tampoco se convierte en otra
 * copia de informacion visible en pantalla bloqueada.
 */
@Entity('push_notification_events', { schema: 'public' })
@Index('uq_push_notification_events_user_dedupe', ['usuarioId', 'dedupeKey'], {
  unique: true,
})
export class PushNotificationEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'event_id' })
  eventId: string;

  @Index()
  @Column('uuid', { name: 'usuario_id' })
  usuarioId: string;

  @Column('character varying', { length: 100 })
  type: string;

  @Column('uuid', { name: 'related_entity_id', nullable: true })
  relatedEntityId: string | null;

  @Column('character varying', { name: 'dedupe_key', length: 300 })
  dedupeKey: string;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt: Date;

  @Column('timestamptz', { name: 'sent_at', nullable: true })
  sentAt: Date | null;

  @Column('character varying', { length: 20, default: 'pending' })
  status: PushNotificationStatus;

  @Column('integer', { name: 'delivered_count', default: 0 })
  deliveredCount: number;
}
