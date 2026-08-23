import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Servicios } from '../services/entities/service.entity';
import { Prorrogas } from './entities/extension.entity';

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
      if (!['pendiente', 'agendado', 'en_curso'].includes(service.estado)) {
        throw new ConflictException('El servicio ya no está activo');
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
}
