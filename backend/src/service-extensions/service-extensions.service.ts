import { Injectable } from '@nestjs/common';
import { CreateServiceExtensionDto } from './dto/create-service-extension.dto';
import { UpdateServiceExtensionDto } from './dto/update-service-extension.dto';

@Injectable()
export class ServiceExtensionsService {
  create(createServiceExtensionDto: CreateServiceExtensionDto) {
    return 'This action adds a new serviceExtension';
  }

  findAll() {
    return `This action returns all serviceExtensions`;
  }

  findOne(id: number) {
    return `This action returns a #${id} serviceExtension`;
  }

  update(id: number, updateServiceExtensionDto: UpdateServiceExtensionDto) {
    return `This action updates a #${id} serviceExtension`;
  }

  remove(id: number) {
    return `This action removes a #${id} serviceExtension`;
  }
}
