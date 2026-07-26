import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavePresetLocationDto } from './dto/transport-operation.dto';
import { PresetServiceLocation } from './entities/preset-service-location.entity';
import { TransportSetting } from './entities/transport-setting.entity';

@Injectable()
export class TransportOperationsService {
  constructor(
    @InjectRepository(TransportSetting) private readonly settings: Repository<TransportSetting>,
    @InjectRepository(PresetServiceLocation) private readonly locations: Repository<PresetServiceLocation>,
  ) {}

  async getConfiguration() {
    const setting = await this.settings.findOneByOrFail({ id: 1 });
    return { ...setting, locations: await this.locations.find({ order: { sortOrder: 'ASC', name: 'ASC' } }) };
  }

  activeLocations() {
    return this.locations.find({ where: { active: true }, order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  async updateFee(externalLocationFee: number, actorId: string) {
    await this.settings.update(1, { externalLocationFee, updatedByUserId: actorId, updatedAt: new Date() });
    return this.settings.findOneByOrFail({ id: 1 });
  }

  createLocation(dto: SavePresetLocationDto) {
    return this.locations.save(this.locations.create(dto));
  }

  async updateLocation(id: string, dto: SavePresetLocationDto) {
    const current = await this.locations.findOneBy({ id });
    if (!current) throw new NotFoundException('Ubicación no encontrada');
    return this.locations.save({ ...current, ...dto, updatedAt: new Date() });
  }

  async removeLocation(id: string) {
    const result = await this.locations.delete(id);
    if (!result.affected) throw new NotFoundException('Ubicación no encontrada');
    return { deleted: true };
  }
}
