import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class BlockClientDto {
  @ApiProperty({ description: 'Por que se bloquea' })
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  readonly reason: string;

  /** Sin fecha final el bloqueo es definitivo; con ella, una suspension. */
  @ApiPropertyOptional({ description: 'Hasta cuando dura, si es temporal' })
  @IsDateString()
  @IsOptional()
  readonly endsAt?: string;
}

export class UnblockClientDto {
  @ApiProperty({ description: 'Por que se levanta el bloqueo' })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  readonly reason: string;
}
