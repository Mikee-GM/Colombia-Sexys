import { PartialType } from '@nestjs/swagger';
import { CreateCatalogExtraDto } from './create-catalog-extra.dto';

export class UpdateCatalogExtraDto extends PartialType(CreateCatalogExtraDto) {}
