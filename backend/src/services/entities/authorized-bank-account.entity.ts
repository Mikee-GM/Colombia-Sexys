import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('authorized_bank_accounts')
export class AuthorizedBankAccounts {
  @PrimaryGeneratedColumn('uuid')
  @ApiProperty({ description: 'ID de la cuenta autorizada', format: 'uuid' })
  id: string;

  @Column({ name: 'banco', type: 'varchar', length: 100 })
  @ApiProperty({ description: 'Nombre del banco (ej. Azteca, BBVA)' })
  banco: string;

  @Column({ name: 'titular', type: 'varchar', length: 255 })
  @ApiProperty({ description: 'Titular de la cuenta' })
  titular: string;

  @Column({ name: 'cuenta', type: 'varchar', length: 50, nullable: true })
  @ApiPropertyOptional({ description: 'Número de cuenta completo (si aplica)' })
  cuenta?: string;

  @Column({ name: 'ultimos4', type: 'varchar', length: 4, nullable: true })
  @ApiPropertyOptional({ description: 'Últimos 4 dígitos de la cuenta o tarjeta' })
  ultimos4?: string;

  @Column({ name: 'clabe', type: 'varchar', length: 18, nullable: true })
  @ApiPropertyOptional({ description: 'CLABE interbancaria' })
  clabe?: string;

  @Column({ name: 'alias', type: 'varchar', length: 100, nullable: true })
  @ApiPropertyOptional({ description: 'Alias interno (ej. Azteca Pipe)' })
  alias?: string;

  @Column({ name: 'activa', type: 'boolean', default: true })
  @ApiProperty({ description: 'Si la cuenta está activa para recibir transferencias' })
  activa: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
