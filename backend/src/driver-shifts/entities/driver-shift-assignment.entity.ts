import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Choferes } from '../../drivers/entities/driver.entity';
import { DriverShift } from './driver-shift.entity';

@Index('driver_shift_assignments_pkey', ['id'], { unique: true })
@Index('driver_shift_assignments_shift_driver_key', ['shiftId', 'driverId'], {
  unique: true,
})
@Entity('driver_shift_assignments', { schema: 'public' })
export class DriverShiftAssignment {
  @Column('uuid', {
    primary: true,
    name: 'id',
    default: () => 'gen_random_uuid()',
  })
  @ApiProperty()
  id: string;

  @Column('uuid', { name: 'shift_id' })
  @ApiProperty()
  shiftId: string;

  @Column('uuid', { name: 'driver_id' })
  @ApiProperty()
  driverId: string;

  @Column('timestamp with time zone', {
    name: 'created_at',
    default: () => 'now()',
  })
  @ApiProperty()
  createdAt: Date;

  @ManyToOne(() => DriverShift, (shift) => shift.assignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'shift_id', referencedColumnName: 'id' }])
  shift: DriverShift;

  @ManyToOne(() => Choferes, { onDelete: 'CASCADE' })
  @JoinColumn([{ name: 'driver_id', referencedColumnName: 'id' }])
  @ApiProperty({ type: () => Choferes })
  driver: Choferes;
}
