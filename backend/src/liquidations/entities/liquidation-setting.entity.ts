import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { ColumnNumericTransformer } from '../../common/transformers/column-numeric.transformer';
import { Usuarios } from '../../users/entities/user.entity';

/**
 * Parametros del corte que administracion puede cambiar sin desplegar.
 *
 * Una sola fila, igual que `transport_settings`: no son ajustes por empleada ni
 * por periodo, son la politica vigente de la empresa.
 */
@Entity('liquidation_settings')
export class LiquidationSetting {
  @Column('smallint', { primary: true, default: 1 })
  id: number;

  @Column('numeric', {
    name: 'card_extra_commission_percentage',
    precision: 5,
    scale: 2,
    default: 15,
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({
    description:
      'Porcentaje que retiene la empresa sobre un extra cobrado con tarjeta que alcance el umbral',
    example: 15,
  })
  cardExtraCommissionPercentage: number;

  @Column('numeric', {
    name: 'card_extra_commission_threshold',
    precision: 12,
    scale: 2,
    default: 1000,
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({
    description:
      'Importe a partir del cual un extra con tarjeta paga comision. Por debajo va integro a la empleada',
    example: 1000,
  })
  cardExtraCommissionThreshold: number;

  @Column('numeric', {
    name: 'weekly_content_fine_amount',
    precision: 12,
    scale: 2,
    default: 300,
    transformer: new ColumnNumericTransformer(),
  })
  @ApiProperty({
    description:
      'Multa que se carga al corte cuando la modelo agota los recordatorios sin subir sus fotos semanales',
    example: 300,
  })
  weeklyContentFineAmount: number;

  @Column('smallint', {
    name: 'weekly_content_max_reminders',
    default: 3,
  })
  @ApiProperty({
    description:
      'Recordatorios de fotos semanales que se envian antes de aplicar la multa',
    example: 3,
  })
  weeklyContentMaxReminders: number;

  @Column('uuid', { name: 'updated_by_user_id', nullable: true })
  updatedByUserId: string | null;

  @Column('timestamptz', { name: 'updated_at', default: () => 'now()' })
  updatedAt: Date;

  @ManyToOne(() => Usuarios, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'updated_by_user_id' })
  updatedBy: Usuarios | null;
}
