import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDate, IsOptional, IsUUID } from 'class-validator';

export class LiquidationPeriodQueryDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @Transform(({ value }: { value: unknown }) => new Date(String(value)))
  @IsDate()
  startDate: Date;

  @ApiPropertyOptional({ format: 'date-time' })
  @Transform(({ value }: { value: unknown }) => new Date(String(value)))
  @IsDate()
  endDate: Date;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID('4')
  employeeId?: string;
}
