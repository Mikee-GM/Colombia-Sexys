import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class SetClientTierDto {
  @ApiPropertyOptional({
    description: 'ID del nivel a asignar',
    example: '00000000-0000-4000-8000-000000000000',
    format: 'uuid',
  })
  @IsUUID()
  @IsOptional()
  readonly tierId?: string;

  @ApiPropertyOptional({
    description: 'Codigo del nivel a asignar cuando no se envia tierId',
    example: 'gold',
  })
  @IsString()
  @IsOptional()
  readonly tierCode?: string;

  @ApiPropertyOptional({
    description: 'Notas de la asignacion manual',
    example: 'Asignacion por cortesia',
  })
  @IsString()
  @IsNotEmpty()
  @IsOptional()
  readonly notes?: string;
}
