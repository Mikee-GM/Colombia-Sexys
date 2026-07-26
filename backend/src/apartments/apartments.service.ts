import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateApartmentDto } from './dto/create-apartment.dto';
import { UpdateApartmentDto } from './dto/update-apartment.dto';
import { Apartments } from './entities/apartment.entity';

@Injectable()
export class ApartmentsService {
  constructor(
    @InjectRepository(Apartments)
    private readonly apartmentsRepository: Repository<Apartments>,
  ) {}

  async create(createApartmentDto: CreateApartmentDto): Promise<Apartments> {
    const apartment = this.apartmentsRepository.create({
      nombre: createApartmentDto.nombre,
      direccion: createApartmentDto.direccion,
      descripcion: createApartmentDto.descripcion,
      ubicacionLat:
        createApartmentDto.ubicacionLat !== undefined &&
        createApartmentDto.ubicacionLat !== null
          ? Number(createApartmentDto.ubicacionLat)
          : null,
      ubicacionLng:
        createApartmentDto.ubicacionLng !== undefined &&
        createApartmentDto.ubicacionLng !== null
          ? Number(createApartmentDto.ubicacionLng)
          : null,
    });
    return this.apartmentsRepository.save(apartment);
  }

  async findAll(): Promise<Apartments[]> {
    return this.apartmentsRepository.find();
  }

  async findOne(id: string): Promise<Apartments> {
    const apartment = await this.apartmentsRepository.findOneBy({ id });
    if (!apartment) {
      throw new NotFoundException(`Apartment with ID ${id} not found`);
    }
    return apartment;
  }

  async update(
    id: string,
    updateApartmentDto: UpdateApartmentDto,
  ): Promise<Apartments> {
    const apartment = await this.findOne(id);

    if (updateApartmentDto.nombre !== undefined)
      apartment.nombre = updateApartmentDto.nombre;
    if (updateApartmentDto.direccion !== undefined)
      apartment.direccion = updateApartmentDto.direccion ?? null;
    if (updateApartmentDto.descripcion !== undefined)
      apartment.descripcion = updateApartmentDto.descripcion ?? null;
    if (updateApartmentDto.ubicacionLat !== undefined) {
      apartment.ubicacionLat =
        updateApartmentDto.ubicacionLat !== null
          ? Number(updateApartmentDto.ubicacionLat)
          : null;
    }
    if (updateApartmentDto.ubicacionLng !== undefined) {
      apartment.ubicacionLng =
        updateApartmentDto.ubicacionLng !== null
          ? Number(updateApartmentDto.ubicacionLng)
          : null;
    }

    return this.apartmentsRepository.save(apartment);
  }

  async remove(id: string): Promise<void> {
    const apartment = await this.findOne(id);
    await this.apartmentsRepository.remove(apartment);
  }
}
