import { PartialType } from '@nestjs/swagger';
import { CreateLoyaltyTierDto } from './create-loyalty-tier.dto';

export class UpdateLoyaltyTierDto extends PartialType(CreateLoyaltyTierDto) {}
