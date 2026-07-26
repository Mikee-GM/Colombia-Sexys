import { Injectable } from '@nestjs/common';
import { CreateServiceExtraDto } from './dto/create-service-extra.dto';
import { UpdateServiceExtraDto } from './dto/update-service-extra.dto';

@Injectable()
export class ServiceExtrasService {
  create(createServiceExtraDto: CreateServiceExtraDto) {
    return 'This action adds a new serviceExtra';
  }

  findAll() {
    return `This action returns all serviceExtras`;
  }

  findOne(id: number) {
    return `This action returns a #${id} serviceExtra`;
  }

  update(id: number, updateServiceExtraDto: UpdateServiceExtraDto) {
    return `This action updates a #${id} serviceExtra`;
  }

  remove(id: number) {
    return `This action removes a #${id} serviceExtra`;
  }
}
