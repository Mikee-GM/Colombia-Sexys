import { Column, Entity, Index } from 'typeorm';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';

@Index(['driverId', 'weekStart'], { unique: true })
@Entity('driver_settlements')
export class DriverSettlement {
  @Column('uuid', { primary: true, default: () => 'gen_random_uuid()' }) id: string;
  @Column('uuid', { name: 'driver_id' }) driverId: string;
  @Column('date', { name: 'week_start' }) weekStart: string;
  @Column('date', { name: 'week_end' }) weekEnd: string;
  @Column('numeric', { precision: 12, scale: 2, default: 0, transformer: new ColumnNumericTransformer() }) total: number;
  @Column('varchar', { length: 20, default: 'pending' }) status: 'pending' | 'paid';
  @Column('timestamptz', { name: 'paid_at', nullable: true }) paidAt: Date | null;
  @Column('uuid', { name: 'paid_by_user_id', nullable: true }) paidByUserId: string | null;
  @Column('timestamptz', { name: 'created_at', default: () => 'now()' }) createdAt: Date;
  @Column('timestamptz', { name: 'updated_at', default: () => 'now()' }) updatedAt: Date;
}
