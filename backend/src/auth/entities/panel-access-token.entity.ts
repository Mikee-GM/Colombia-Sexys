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

/**
 * Pase de vida corta para entrar al panel web desde Telegram.
 *
 * Se gasta al canjearlo, con una ventana de cortesia de un par de minutos: el
 * enlace se abre por GET y basta con que lo toque la previsualizacion de
 * Telegram para quemarlo antes de que llegue el usuario. Ver
 * `PanelAccessService`.
 *
 * El jefe ya probo quien es cuando vinculo su cuenta: el bot solo habla con
 * chats vinculados. Pedirle usuario y contrasena otra vez para editar un
 * servicio no agrega seguridad, solo friccion. Este pase cambia una prueba de
 * identidad por otra equivalente y de vida corta.
 */
@Entity('panel_access_tokens')
@Index('IDX_panel_access_tokens_token_hash', ['tokenHash'], { unique: true })
@Index('IDX_panel_access_tokens_user_id', ['userId'])
export class PanelAccessToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'user_id' })
  userId: string;

  @ManyToOne(() => Usuarios, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Usuarios;

  /** En la base solo vive la huella: un volcado de la tabla no da acceso. */
  @Column('char', { name: 'token_hash', length: 64 })
  tokenHash: string;

  /**
   * Chat de Telegram al que se entrego el pase. Telegram guarda el historial y
   * los mensajes se reenvian, asi que el pase solo vale para el chat que lo
   * pidio.
   */
  @Column('varchar', { name: 'chat_id', length: 64, nullable: true })
  chatId: string | null;

  /** A donde llevar al jefe: la ficha del servicio, no el tablero generico. */
  @Column('varchar', { name: 'redirect_path', length: 300, nullable: true })
  redirectPath: string | null;

  @Column('timestamp with time zone', { name: 'expires_at' })
  expiresAt: Date;

  @Column('timestamp with time zone', { name: 'used_at', nullable: true })
  usedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;
}
