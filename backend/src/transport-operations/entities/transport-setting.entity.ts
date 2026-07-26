import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';
import { Usuarios } from '../../users/entities/user.entity';

@Entity('transport_settings')
export class TransportSetting {
  @Column('smallint', { primary: true, default: 1 })
  id: number;

  @Column('numeric', { name: 'external_location_fee', precision: 10, scale: 2, transformer: new ColumnNumericTransformer() })
  externalLocationFee: number;

  @Column('uuid', { name: 'updated_by_user_id', nullable: true })
  updatedByUserId: string | null;

  @Column('timestamptz', { name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;

  @ManyToOne(() => Usuarios, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by_user_id' })
  updatedBy: Usuarios | null;
}
