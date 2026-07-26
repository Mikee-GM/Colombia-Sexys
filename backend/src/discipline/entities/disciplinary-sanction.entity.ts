import { Column, Entity, Index } from 'typeorm';

@Entity('disciplinary_sanctions')
@Index(['subjectType', 'subjectId', 'status'])
export class DisciplinarySanction {
  @Column('uuid', { primary: true, default: () => 'gen_random_uuid()' })
  id: string;

  @Column('varchar', { name: 'subject_type', length: 20 })
  subjectType: 'client' | 'employee' | 'driver';

  @Column('uuid', { name: 'subject_id' })
  subjectId: string;

  @Column('varchar', { length: 20 })
  type: 'suspension' | 'permanent_ban';

  @Column('varchar', { length: 20, default: 'active' })
  status: 'active' | 'revoked' | 'expired';

  @Column('text')
  reason: string;

  @Column('uuid', { name: 'conduct_report_id', nullable: true })
  conductReportId: string | null;

  @Column('uuid', { name: 'created_by_user_id' })
  createdByUserId: string;

  @Column('timestamptz', { name: 'starts_at', default: () => 'now()' })
  startsAt: Date;

  @Column('timestamptz', { name: 'ends_at', nullable: true })
  endsAt: Date | null;

  @Column('uuid', { name: 'revoked_by_user_id', nullable: true })
  revokedByUserId: string | null;

  @Column('timestamptz', { name: 'revoked_at', nullable: true })
  revokedAt: Date | null;

  @Column('text', { name: 'revocation_reason', nullable: true })
  revocationReason: string | null;

  @Column('timestamptz', { name: 'created_at', default: () => 'now()' })
  createdAt: Date;
}
