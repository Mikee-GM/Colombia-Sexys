import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Buzon de eventos en vivo, para que lleguen a todas las replicas.
 *
 * El canal SSE del panel son objetos en memoria del proceso, asi que un jefe
 * conectado a una replica no veia lo que emitia la otra. Postgres se encarga de
 * avisar (`NOTIFY`), pero su carga util esta limitada a 8 KB y un evento con el
 * servicio y sus relaciones puede pasarse: por eso el aviso lleva solo el `id`
 * y el contenido viaja por esta tabla.
 */
@Entity('realtime_outbox')
export class RealtimeOutboxEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column('jsonb')
  payload: unknown;

  @Index()
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
