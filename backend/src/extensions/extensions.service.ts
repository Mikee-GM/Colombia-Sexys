import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Servicios } from '../services/entities/service.entity';
import { Prorrogas } from './entities/extension.entity';
import { CreateExtensionDto } from './dto/create-extension.dto';
import { UpdateExtensionDto } from './dto/update-extension.dto';

@Injectable()
export class ExtensionsService {
  constructor(private readonly dataSource: DataSource) {}

  async requestServiceExtension(serviceId: string, minutes = 10) {
    return this.dataSource.transaction(async (manager) => {
      const service = await manager.findOne(Servicios, {
        where: { id: serviceId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!service) throw new NotFoundException('Servicio no encontrado');
      if (service.estado !== 'en_curso') {
        throw new ConflictException('El servicio ya no está en curso');
      }
      if (service.prorrogasUsadas >= 3) {
        throw new ConflictException('Ya se usaron las 3 prórrogas permitidas');
      }

      const nextNumber = service.prorrogasUsadas + 1;
      await manager.save(Prorrogas, {
        servicioId: service.id,
        numeroProrroga: nextNumber,
        minutosSolicitados: minutes,
        aprobada: true,
      });
      service.prorrogasUsadas = nextNumber;
      await manager.save(service);
      return { service, extensionNumber: nextNumber, minutes };
    });
  }

  create(createExtensionDto: CreateExtensionDto) {
    return 'This action adds a new extension';
  }

  findAll() {
    return `This action returns all extensions`;
  }

  findOne(id: number) {
    return `This action returns a #${id} extension`;
  }

  update(id: number, updateExtensionDto: UpdateExtensionDto) {
    return `This action updates a #${id} extension`;
  }

  remove(id: number) {
    return `This action removes a #${id} extension`;
  }
}
