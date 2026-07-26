import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('telegram_sessions')
export class TelegramSession {
  @PrimaryColumn('varchar', { length: 255 })
  key: string;

  @Column('jsonb', { nullable: true })
  data: any;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
