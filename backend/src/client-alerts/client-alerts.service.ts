import { Injectable } from '@nestjs/common';
import { CreateClientAlertDto } from './dto/create-client-alert.dto';
import { UpdateClientAlertDto } from './dto/update-client-alert.dto';

@Injectable()
export class ClientAlertsService {
  create(createClientAlertDto: CreateClientAlertDto) {
    return 'This action adds a new clientAlert';
  }

  findAll() {
    return `This action returns all clientAlerts`;
  }

  findOne(id: number) {
    return `This action returns a #${id} clientAlert`;
  }

  update(id: number, updateClientAlertDto: UpdateClientAlertDto) {
    return `This action updates a #${id} clientAlert`;
  }

  remove(id: number) {
    return `This action removes a #${id} clientAlert`;
  }
}
