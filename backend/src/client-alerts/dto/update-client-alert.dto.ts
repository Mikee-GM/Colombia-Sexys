import { PartialType } from '@nestjs/swagger';
import { CreateClientAlertDto } from './create-client-alert.dto';

export class UpdateClientAlertDto extends PartialType(CreateClientAlertDto) {}
