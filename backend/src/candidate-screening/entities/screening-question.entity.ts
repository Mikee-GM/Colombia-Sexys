import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index } from 'typeorm';

@Index('screening_questions_pkey', ['id'], { unique: true })
@Entity('screening_questions', { schema: 'public' })
export class ScreeningQuestion {
  @Column('uuid', {
    primary: true,
    name: 'id',
    default: () => 'gen_random_uuid()',
  })
  @ApiProperty()
  id: string;

  @Column('text', { name: 'text' })
  @ApiProperty()
  text: string;

  @Column('boolean', { name: 'active', default: true })
  @ApiProperty()
  active: boolean;

  @Column('smallint', { name: 'display_order', default: 0 })
  @ApiProperty()
  order: number;

  @Column('timestamp with time zone', {
    name: 'created_at',
    default: () => 'now()',
  })
  @ApiProperty()
  createdAt: Date;
}
