import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { Empleadas } from '../../employees/entities/employee.entity';

@Index('idx_empleada_fotos_exclusivas_empleada', ['empleadaId'], {})
@Index('empleada_fotos_exclusivas_pkey', ['id'], { unique: true })
@Entity('empleada_fotos_exclusivas', { schema: 'public' })
export class EmpleadaFotosExclusivas {
  @Column('uuid', {
    primary: true,
    name: 'id',
    default: () => 'gen_random_uuid()',
  })
  @ApiProperty({
    description: 'Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  id: string;

  @Column('uuid', { name: 'empleada_id' })
  @ApiProperty({
    description: 'Empleada Id',
    example: '00000000-0000-4000-8000-000000000000',
  })
  empleadaId: string;

  @Column('text', { name: 'url' })
  @ApiProperty({
    description: 'Url privada',
    example: 'https://example.com/recurso.jpg',
  })
  url: string;

  @Column('smallint', { name: 'orden', default: () => '0' })
  @ApiProperty({ description: 'Orden', example: 1 })
  orden: number;

  @Column('timestamp with time zone', {
    name: 'created_at',
    default: () => 'now()',
  })
  @ApiProperty({
    description: 'Created At',
    type: String,
    format: 'date-time',
    example: '2026-08-17T12:00:00.000Z',
  })
  createdAt: Date;

  @ManyToOne(() => Empleadas, (empleadas) => empleadas.fotosExclusivas, {
    onDelete: 'CASCADE',
  })
  @JoinColumn([{ name: 'empleada_id', referencedColumnName: 'id' }])
  @ApiProperty({ description: 'Empleada', type: () => Empleadas })
  empleada: Empleadas;
}
