import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('telegram_sessions')
export class TelegramSession {
  @PrimaryColumn('varchar', { length: 255 })
  key: string;

  @Column('jsonb', { nullable: true })
  data: any;

  /**
   * Contador que sube en cada escritura.
   *
   * El almacen de sesiones lee la fila al empezar el update y la escribe entera
   * al terminar. Sin este contador, dos updates solapados del mismo cliente
   * leian el mismo estado y el ultimo pisaba al primero. La escritura ahora
   * exige que la version siga siendo la que se leyo; si no lo es, el almacen
   * relee y aplica encima solo lo que cambio este update.
   */
  @Column('integer', { default: 0 })
  version: number;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
