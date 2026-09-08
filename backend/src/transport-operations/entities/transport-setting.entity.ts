import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';
import { Usuarios } from '../../users/entities/user.entity';

@Entity('transport_settings')
export class TransportSetting {
  @Column('smallint', { primary: true, default: 1 })
  id: number;

  @Column('numeric', {
    name: 'external_location_fee',
    precision: 10,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  externalLocationFee: number;

  /**
   * Area de cobertura: el unico sitio donde se atiende. Un pin fuera de este
   * circulo no es un servicio caro, es un servicio imposible, y se corta antes
   * de cotizarlo.
   */
  @Column('varchar', {
    name: 'coverage_city',
    length: 80,
    default: 'Querétaro',
  })
  coverageCity: string;

  @Column('numeric', {
    name: 'coverage_center_lat',
    precision: 10,
    scale: 7,
    transformer: new ColumnNumericTransformer(),
  })
  coverageCenterLat: number;

  @Column('numeric', {
    name: 'coverage_center_lng',
    precision: 10,
    scale: 7,
    transformer: new ColumnNumericTransformer(),
  })
  coverageCenterLng: number;

  @Column('numeric', {
    name: 'coverage_radius_km',
    precision: 6,
    scale: 2,
    transformer: new ColumnNumericTransformer(),
  })
  coverageRadiusKm: number;

  @Column('uuid', { name: 'updated_by_user_id', nullable: true })
  updatedByUserId: string | null;

  @Column('timestamptz', { name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;

  @ManyToOne(() => Usuarios, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by_user_id' })
  updatedBy: Usuarios | null;
}
