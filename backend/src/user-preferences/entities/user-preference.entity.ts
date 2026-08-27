import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { Usuarios } from '../../users/entities/user.entity';

/**
 * Un ajuste de interfaz de un usuario.
 *
 * La clave primaria es el par usuario + clave, de modo que guardar es siempre
 * un upsert y no hace falta buscar antes de escribir.
 */
@Entity('user_preferences')
export class UserPreference {
  @Column('uuid', { primary: true, name: 'user_id' })
  userId: string;

  @Column('varchar', { primary: true, length: 60 })
  @ApiProperty({ description: 'Clave del ajuste', example: 'dashboard_layout' })
  key: string;

  @Column('jsonb', { default: () => "'{}'::jsonb" })
  @ApiProperty({ description: 'Contenido del ajuste', type: Object })
  value: Record<string, unknown>;

  @Column('timestamptz', { name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;

  @ManyToOne(() => Usuarios, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Usuarios;
}
