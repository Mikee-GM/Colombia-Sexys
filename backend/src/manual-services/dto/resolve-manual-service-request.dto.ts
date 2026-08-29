import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ResolveManualServiceRequestDto {
  @ApiPropertyOptional({ description: 'Nota para la empleada' })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  readonly nota?: string;
}
