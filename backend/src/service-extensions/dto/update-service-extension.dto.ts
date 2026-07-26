import { PartialType } from '@nestjs/swagger';
import { CreateServiceExtensionDto } from './create-service-extension.dto';

export class UpdateServiceExtensionDto extends PartialType(
  CreateServiceExtensionDto,
) {}
