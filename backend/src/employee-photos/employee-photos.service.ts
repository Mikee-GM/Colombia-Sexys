import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateEmployeePhotoDto } from './dto/create-employee-photo.dto';
import { UpdateEmployeePhotoDto } from './dto/update-employee-photo.dto';
import { EmpleadaFotos } from './entities/employee-photo.entity';
import { EmpleadaFotosExclusivas } from './entities/employee-private-photo.entity';
import { Empleadas } from '../employees/entities/employee.entity';

@Injectable()
export class EmployeePhotosService {
  constructor(
    @InjectRepository(EmpleadaFotos)
    private readonly empleadaFotosRepository: Repository<EmpleadaFotos>,
    @InjectRepository(EmpleadaFotosExclusivas)
    private readonly fotosExclusivasRepository: Repository<EmpleadaFotosExclusivas>,
    @InjectRepository(Empleadas)
    private readonly empleadasRepository: Repository<Empleadas>,
  ) {}

  async create(
    createEmployeePhotoDto: CreateEmployeePhotoDto,
  ): Promise<EmpleadaFotos> {
    const { empleadaId, url, orden } = createEmployeePhotoDto;

    // 1. Validar que la empleada exista
    const empleada = await this.empleadasRepository.findOne({
      where: { id: empleadaId },
    });
    if (!empleada) {
      throw new NotFoundException(
        `Empleada con ID ${empleadaId} no encontrada`,
      );
    }

    // 2. Crear y guardar la foto
    const nuevaFoto = this.empleadaFotosRepository.create({
      empleadaId,
      url,
      orden: orden ?? 0,
    });

    return await this.empleadaFotosRepository.save(nuevaFoto);
  }

  async findAll(): Promise<EmpleadaFotos[]> {
    return await this.empleadaFotosRepository.find({
      relations: { empleada: true },
    });
  }

  async findOne(id: string): Promise<EmpleadaFotos> {
    const foto = await this.empleadaFotosRepository.findOne({
      where: { id },
      relations: { empleada: true },
    });

    if (!foto) {
      throw new NotFoundException(
        `Foto de empleada con ID ${id} no encontrada`,
      );
    }

    return foto;
  }

  async update(
    id: string,
    updateEmployeePhotoDto: UpdateEmployeePhotoDto,
  ): Promise<EmpleadaFotos> {
    const foto = await this.findOne(id);

    if (updateEmployeePhotoDto.empleadaId) {
      const empleada = await this.empleadasRepository.findOne({
        where: { id: updateEmployeePhotoDto.empleadaId },
      });
      if (!empleada) {
        throw new NotFoundException(
          `Empleada con ID ${updateEmployeePhotoDto.empleadaId} no encontrada`,
        );
      }
    }

    await this.empleadaFotosRepository.update(id, updateEmployeePhotoDto);

    return await this.findOne(id);
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    await this.findOne(id);
    await this.empleadaFotosRepository.delete(id);
    return { deleted: true };
  }

  // --- MÉTODOS PARA FOTOS EXCLUSIVAS (CLIENTES TELEGRAM) ---

  async findPrivatePhotosByEmployee(
    empleadaId: string,
  ): Promise<EmpleadaFotosExclusivas[]> {
    return await this.fotosExclusivasRepository.find({
      where: { empleadaId },
      order: { orden: 'ASC', createdAt: 'DESC' },
    });
  }

  async createPrivatePhoto(
    empleadaId: string,
    url: string,
    orden = 0,
  ): Promise<EmpleadaFotosExclusivas> {
    const empleada = await this.empleadasRepository.findOne({
      where: { id: empleadaId },
    });
    if (!empleada) {
      throw new NotFoundException(`Empleada con ID ${empleadaId} no encontrada`);
    }

    const nuevaFoto = this.fotosExclusivasRepository.create({
      empleadaId,
      url,
      orden,
    });
    return await this.fotosExclusivasRepository.save(nuevaFoto);
  }

  async removePrivatePhoto(id: string): Promise<{ deleted: boolean }> {
    const foto = await this.fotosExclusivasRepository.findOne({ where: { id } });
    if (!foto) {
      throw new NotFoundException(`Foto exclusiva con ID ${id} no encontrada`);
    }
    await this.fotosExclusivasRepository.delete(id);
    return { deleted: true };
  }
}
