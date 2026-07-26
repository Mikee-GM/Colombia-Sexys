import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Usuarios } from '../../users/entities/user.entity';

@Entity('auth_sessions')
@Index('IDX_auth_sessions_user_id', ['userId'])
@Index('IDX_auth_sessions_family_id', ['familyId'])
export class AuthSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @ManyToOne(() => Usuarios, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Usuarios;

  @Column('uuid', { name: 'family_id' })
  familyId: string;

  @Column('varchar', { name: 'device_id', length: 128 })
  deviceId: string;

  @Column('char', { name: 'refresh_token_hash', length: 64 })
  refreshTokenHash: string;

  @Column('timestamp with time zone', { name: 'expires_at' })
  expiresAt: Date;

  @Column('timestamp with time zone', {
    name: 'revoked_at',
    nullable: true,
  })
  revokedAt: Date | null;

  @Column('uuid', { name: 'replaced_by_session_id', nullable: true })
  replacedBySessionId: string | null;

  @CreateDateColumn({
    type: 'timestamp with time zone',
    name: 'created_at',
  })
  createdAt: Date;
}
