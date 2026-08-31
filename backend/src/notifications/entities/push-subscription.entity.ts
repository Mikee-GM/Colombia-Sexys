import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Usuarios } from '../../users/entities/user.entity';

/**
 * Un destino de aviso push: un navegador concreto de un dispositivo concreto.
 *
 * No hay una fila por usuario sino una por dispositivo, asi que quien envia
 * tiene que recorrerlas todas. El `endpoint` es unico porque es lo que
 * identifica al destino de verdad; el navegador lo repite si el mismo
 * dispositivo se vuelve a suscribir.
 *
 * `p256dh` y `auth` son las claves con las que el navegador descifra el aviso.
 * No sirven para nada mas y no identifican a nadie por si solas.
 */
@Entity('push_subscriptions', { schema: 'public' })
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column('uuid', { name: 'usuario_id' })
  @ApiProperty({ description: 'Usuario dueño de la suscripcion' })
  usuarioId: string;

  @Column('text', { unique: true })
  @ApiProperty({ description: 'URL del servicio de push del navegador' })
  endpoint: string;

  @Column('text')
  p256dh: string;

  @Column('text')
  auth: string;

  /** Solo para poder distinguir un dispositivo de otro al diagnosticar. */
  @Column('text', { name: 'user_agent', nullable: true })
  userAgent: string | null;

  @Column('timestamptz', { name: 'creada_en', default: () => 'now()' })
  creadaEn: Date;

  @Column('timestamptz', { name: 'ultimo_envio', nullable: true })
  ultimoEnvio: Date | null;

  @Column('smallint', { default: 0 })
  fallos: number;

  @ManyToOne(() => Usuarios, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuarios;
}
