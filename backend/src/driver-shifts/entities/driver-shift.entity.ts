import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { Usuarios } from '../../users/entities/user.entity';
import { DriverShiftAssignment } from './driver-shift-assignment.entity';

@Index('driver_shifts_pkey', ['id'], { unique: true })
@Entity('driver_shifts', { schema: 'public' })
export class DriverShift {
  @Column('uuid', {
    primary: true,
    name: 'id',
    default: () => 'gen_random_uuid()',
  })
  @ApiProperty()
  id: string;

  @Column('character varying', { name: 'title', length: 120 })
  @ApiProperty()
  title: string;

  /** Hora local en formato "HH:MM" (24h). */
  @Column('character varying', { name: 'starts_at', length: 5 })
  @ApiProperty({ example: '08:00' })
  startsAt: string;

  /** Hora local en formato "HH:MM" (24h). Si es menor que startsAt, el turno cruza la medianoche. */
  @Column('character varying', { name: 'ends_at', length: 5 })
  @ApiProperty({ example: '16:00' })
  endsAt: string;

  /** 0=domingo … 6=sábado, igual que Date.getDay() en JS y EXTRACT(DOW) en Postgres. */
  @Column('smallint', { name: 'days_of_week', array: true })
  @ApiProperty({ type: [Number], example: [1, 2, 3, 4, 5] })
  daysOfWeek: number[];

  @Column('integer', { name: 'capacity', nullable: true })
  @ApiPropertyOptional({ description: 'Máximo de choferes; null = sin límite' })
  capacity: number | null;

  @Column('boolean', { name: 'active', default: true })
  @ApiProperty()
  active: boolean;

  @Column('uuid', { name: 'created_by_user_id' })
  @ApiProperty()
  createdByUserId: string;

  @Column('timestamp with time zone', {
    name: 'created_at',
    default: () => 'now()',
  })
  @ApiProperty()
  createdAt: Date;

  @ManyToOne(() => Usuarios, { onDelete: 'RESTRICT' })
  @JoinColumn([{ name: 'created_by_user_id', referencedColumnName: 'id' }])
  createdBy: Usuarios;

  @OneToMany(() => DriverShiftAssignment, (assignment) => assignment.shift)
  @ApiProperty({ type: () => [DriverShiftAssignment] })
  assignments: DriverShiftAssignment[];
}
