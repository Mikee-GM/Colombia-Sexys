import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExtrasCatalogo } from './entities/catalog-extra.entity';
import { CreateCatalogExtraDto } from './dto/create-catalog-extra.dto';
import { UpdateCatalogExtraDto } from './dto/update-catalog-extra.dto';

@Injectable()
export class CatalogExtrasService {
  constructor(
    @InjectRepository(ExtrasCatalogo)
    private readonly extrasCatalogoRepository: Repository<ExtrasCatalogo>,
  ) {}

  async create(
    createCatalogExtraDto: CreateCatalogExtraDto,
  ): Promise<ExtrasCatalogo> {
    const extra = this.extrasCatalogoRepository.create({
      empleadaId: createCatalogExtraDto.empleadaId,
      nombre: createCatalogExtraDto.nombre,
      precio: createCatalogExtraDto.precio,
      activo: true,
    });
    return this.extrasCatalogoRepository.save(extra);
  }

  async findAll(): Promise<ExtrasCatalogo[]> {
    return this.extrasCatalogoRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findByEmpleada(empleadaId: string): Promise<ExtrasCatalogo[]> {
    return this.extrasCatalogoRepository.find({
      where: { empleadaId, activo: true },
      order: { nombre: 'ASC' },
    });
  }

  async findOne(id: string): Promise<ExtrasCatalogo> {
    const extra = await this.extrasCatalogoRepository.findOne({
      where: { id },
    });
    if (!extra) {
      throw new NotFoundException(`Catalog extra with ID ${id} not found`);
    }
    return extra;
  }

  async update(
    id: string,
    updateCatalogExtraDto: UpdateCatalogExtraDto,
  ): Promise<ExtrasCatalogo> {
    const extra = await this.findOne(id);
    if (updateCatalogExtraDto.nombre !== undefined) {
      extra.nombre = updateCatalogExtraDto.nombre;
    }
    if (updateCatalogExtraDto.precio !== undefined) {
      extra.precio = updateCatalogExtraDto.precio;
    }
    return this.extrasCatalogoRepository.save(extra);
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const result = await this.extrasCatalogoRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Catalog extra with ID ${id} not found`);
    }
    return { deleted: true };
  }
}
