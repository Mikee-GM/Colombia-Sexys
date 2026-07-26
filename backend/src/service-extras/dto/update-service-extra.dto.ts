import { PartialType } from '@nestjs/swagger';
import { CreateServiceExtraDto } from './create-service-extra.dto';

export class UpdateServiceExtraDto extends PartialType(CreateServiceExtraDto) {}
