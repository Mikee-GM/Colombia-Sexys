import { Column, Entity, Index } from 'typeorm';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';

@Index('idx_preset_service_locations_active_order', ['active', 'sortOrder'])
@Entity('preset_service_locations')
export class PresetServiceLocation {
  @Column('uuid', { primary: true, default: () => 'gen_random_uuid()' }) id: string;
  @Column('varchar', { length: 80 }) name: string;
  @Column('varchar', { length: 240 }) address: string;
  @Column('numeric', { precision: 10, scale: 7, transformer: new ColumnNumericTransformer() }) latitude: number;
  @Column('numeric', { precision: 10, scale: 7, transformer: new ColumnNumericTransformer() }) longitude: number;
  @Column('boolean', { default: true }) active: boolean;
  @Column('integer', { name: 'sort_order', default: 0 }) sortOrder: number;
  @Column('timestamptz', { name: 'created_at', default: () => 'now()' }) createdAt: Date;
  @Column('timestamptz', { name: 'updated_at', default: () => 'now()' }) updatedAt: Date;
}
