import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Empleadas } from '../../employees/entities/employee.entity';
import { Viajes } from '../../trips/entities/trip.entity';

@Entity('trip_passengers')
@Index('uq_trip_passenger', ['tripId', 'employeeId'], { unique: true })
export class TripPassenger {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid', { name: 'trip_id' })
  tripId: string;

  @Column('uuid', { name: 'employee_id' })
  employeeId: string;

  @ManyToOne(() => Viajes, (trip) => trip.passengers, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'trip_id' })
  trip: Viajes;

  @ManyToOne(() => Empleadas, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'employee_id' })
  employee: Empleadas;
}
