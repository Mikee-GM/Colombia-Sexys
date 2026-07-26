import { PartialType } from '@nestjs/swagger';
import { CreateEmployeePhotoDto } from './create-employee-photo.dto';

export class UpdateEmployeePhotoDto extends PartialType(
  CreateEmployeePhotoDto,
) {}
