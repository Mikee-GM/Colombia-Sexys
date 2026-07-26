import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateLiquidationRecordDto } from './create-liquidation-record.dto';

export class UpdateLiquidationRecordDto extends PartialType(
  OmitType(CreateLiquidationRecordDto, ['employeeId'] as const),
) {}
