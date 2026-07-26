import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { Choferes } from './entities/driver.entity';
import { Usuarios } from '../users/entities/user.entity';

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(Choferes)
    private readonly choferesRepository: Repository<Choferes>,
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    private readonly dataSource: DataSource,
  ) {}

  async create(createDriverDto: CreateDriverDto): Promise<Choferes> {
    const {
      email,
      password,
      telegramChatId,
      nombre,
      telefono,
      disponible,
      ubicacionLat,
      ubicacionLng,
      vehiculoMarca,
      vehiculoModelo,
      vehiculoColor,
      vehiculoPlaca,
    } = createDriverDto;

    // 1. Validar que el email no esté registrado
    const usuarioExistente = await this.usuariosRepository.findOne({
      where: { email },
    });
    if (usuarioExistente) {
      throw new ConflictException(
        `El correo electrónico ${email} ya está registrado`,
      );
    }

    // 2. Ejecutar transacción para creación atómica
    const result = await this.dataSource.transaction(async (manager) => {
      // A. Hashear la contraseña
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // B. Crear el usuario
      const nuevoUsuario = manager.create(Usuarios, {
        email,
        passwordHash,
        rol: 'chofer',
        telegramChatId: telegramChatId || null,
      });
      const usuarioGuardado = await manager.save(Usuarios, nuevoUsuario);

      // C. Crear el chofer vinculado
      const nuevoChofer = manager.create(Choferes, {
        usuarioId: usuarioGuardado.id,
        nombre,
        telefono,
        disponible: disponible ?? true,
        ubicacionLat: ubicacionLat ? Number(ubicacionLat) : null,
        ubicacionLng: ubicacionLng ? Number(ubicacionLng) : null,
        vehiculoMarca: vehiculoMarca || null,
        vehiculoModelo: vehiculoModelo || null,
        vehiculoColor: vehiculoColor || null,
        vehiculoPlaca: vehiculoPlaca || null,
      });
      const choferGuardado = await manager.save(Choferes, nuevoChofer);

      choferGuardado.usuario = usuarioGuardado;
      return choferGuardado;
    });

    // Omitir passwordHash de la respuesta
    if (result.usuario) {
      const { passwordHash: _, ...usuarioSinPassword } = result.usuario;
      result.usuario = usuarioSinPassword as Usuarios;
    }

    return result;
  }

  async findAll(): Promise<Choferes[]> {
    return await this.choferesRepository.find({
      relations: { usuario: true },
    });
  }

  async findOne(id: string): Promise<Choferes> {
    const chofer = await this.choferesRepository.findOne({
      where: { id },
      relations: { usuario: true },
    });

    if (!chofer) {
      throw new NotFoundException(`Chofer con ID ${id} no encontrado`);
    }

    return chofer;
  }

  async update(
    id: string,
    updateDriverDto: UpdateDriverDto,
  ): Promise<Choferes> {
    await this.findOne(id);

    // Actualizar campos
    const updateData: any = { ...updateDriverDto };
    if (updateDriverDto.ubicacionLat !== undefined) {
      updateData.ubicacionLat =
        updateDriverDto.ubicacionLat !== null
          ? Number(updateDriverDto.ubicacionLat)
          : null;
    }
    if (updateDriverDto.ubicacionLng !== undefined) {
      updateData.ubicacionLng =
        updateDriverDto.ubicacionLng !== null
          ? Number(updateDriverDto.ubicacionLng)
          : null;
    }

    await this.choferesRepository.update(id, updateData);

    return await this.findOne(id);
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    await this.findOne(id);
    await this.choferesRepository.delete(id);
    return { deleted: true };
  }

  async findAvailableDriversOrderByDistance(
    lat: number,
    lng: number,
  ): Promise<{ chofer: Choferes; distancia: number }[]> {
    const result = await this.choferesRepository
      .createQueryBuilder('chofer')
      .innerJoinAndSelect('chofer.usuario', 'usuario')
      .where('chofer.disponible = :disponible', { disponible: true })
      .andWhere('usuario.activo = :usuarioActivo', { usuarioActivo: true })
      .andWhere('usuario.telegramChatId IS NOT NULL')
      .andWhere('chofer.ubicacionLat IS NOT NULL')
      .andWhere('chofer.ubicacionLng IS NOT NULL')
      .select([
        'chofer.id',
        'chofer.nombre',
        'chofer.telefono',
        'chofer.ubicacionLat',
        'chofer.ubicacionLng',
        'usuario.telegramChatId',
      ])
      .addSelect(
        'calcular_distancia_haversine(:lat, :lng, CAST(chofer.ubicacion_lat AS double precision), CAST(chofer.ubicacion_lng AS double precision))',
        'distancia',
      )
      .setParameter('lat', lat)
      .setParameter('lng', lng)
      .orderBy('distancia', 'ASC')
      .getRawAndEntities();

    return result.entities.map((entity, index) => {
      const raw = result.raw[index];
      return {
        chofer: entity,
        distancia: parseFloat(raw.distancia),
      };
    });
  }
}
