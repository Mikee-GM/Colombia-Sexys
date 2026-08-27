import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SavePresetLocationDto } from './dto/transport-operation.dto';
import { PresetServiceLocation } from './entities/preset-service-location.entity';
import { TransportSetting } from './entities/transport-setting.entity';

/**
 * Cuanto vale la copia en memoria de la configuracion de transporte.
 *
 * Estos dos datos —las ubicaciones activas y el cargo por salir de zona— los
 * consulta CADA mensaje de CADA conversacion con la IA para armar el prompt, y
 * los cambia un jefe de higos a brevas. Sin la copia eran tres consultas por
 * mensaje, que con varias conversaciones a la vez es de lo que primero agota el
 * pool de conexiones.
 */
const CACHE_TTL_MS = 60_000;

@Injectable()
export class TransportOperationsService {
  private locationsCache?: { at: number; value: PresetServiceLocation[] };
  private feeCache?: { at: number; value: number };

  constructor(
    @InjectRepository(TransportSetting)
    private readonly settings: Repository<TransportSetting>,
    @InjectRepository(PresetServiceLocation)
    private readonly locations: Repository<PresetServiceLocation>,
  ) {}

  /** Tira las copias en memoria tras cualquier escritura. */
  private invalidateCache(): void {
    this.locationsCache = undefined;
    this.feeCache = undefined;
  }

  async getConfiguration() {
    const setting = await this.settings.findOneByOrFail({ id: 1 });
    return {
      ...setting,
      locations: await this.locations.find({
        order: { sortOrder: 'ASC', name: 'ASC' },
      }),
    };
  }

  async activeLocations(): Promise<PresetServiceLocation[]> {
    const cached = this.locationsCache;
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

    const value = await this.locations.find({
      where: { active: true },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    this.locationsCache = { at: Date.now(), value };
    return value;
  }

  /**
   * Solo el cargo por ubicacion externa, que es lo unico que el prompt de la
   * modelo necesita de la configuracion. `getConfiguration()` traia ademas
   * TODAS las ubicaciones, activas o no, para tirarlas acto seguido.
   */
  async externalLocationFee(): Promise<number> {
    const cached = this.feeCache;
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;

    const setting = await this.settings.findOne({
      where: { id: 1 },
      select: { id: true, externalLocationFee: true },
    });
    const value = Number(setting?.externalLocationFee ?? 0);
    this.feeCache = { at: Date.now(), value };
    return value;
  }

  async updateFee(externalLocationFee: number, actorId: string) {
    await this.settings.update(1, {
      externalLocationFee,
      updatedByUserId: actorId,
      updatedAt: new Date(),
    });
    this.invalidateCache();
    return this.settings.findOneByOrFail({ id: 1 });
  }

  async createLocation(dto: SavePresetLocationDto) {
    const created = await this.locations.save(this.locations.create(dto));
    this.invalidateCache();
    return created;
  }

  async updateLocation(id: string, dto: SavePresetLocationDto) {
    const current = await this.locations.findOneBy({ id });
    if (!current) throw new NotFoundException('Ubicación no encontrada');
    const saved = await this.locations.save({
      ...current,
      ...dto,
      updatedAt: new Date(),
    });
    this.invalidateCache();
    return saved;
  }

  async removeLocation(id: string) {
    const result = await this.locations.delete(id);
    if (!result.affected)
      throw new NotFoundException('Ubicación no encontrada');
    this.invalidateCache();
    return { deleted: true };
  }
}
