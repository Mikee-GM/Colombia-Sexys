import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateEmployeePhotoDto } from './dto/create-employee-photo.dto';
import { UpdateEmployeePhotoDto } from './dto/update-employee-photo.dto';
import { EmpleadaFotos } from './entities/employee-photo.entity';
import { EmpleadaFotosExclusivas } from './entities/employee-private-photo.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { UploadService } from '../upload/upload.service';
import type { PhotoGallery } from './dto/gallery.dto';

@Injectable()
export class EmployeePhotosService {
  private readonly logger = new Logger(EmployeePhotosService.name);

  constructor(
    @InjectRepository(EmpleadaFotos)
    private readonly empleadaFotosRepository: Repository<EmpleadaFotos>,
    @InjectRepository(EmpleadaFotosExclusivas)
    private readonly fotosExclusivasRepository: Repository<EmpleadaFotosExclusivas>,
    @InjectRepository(Empleadas)
    private readonly empleadasRepository: Repository<Empleadas>,
    private readonly uploadService: UploadService,
    private readonly dataSource: DataSource,
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
    const foto = await this.findOne(id);
    await this.empleadaFotosRepository.delete(id);
    await this.discardFileIfUnused(foto.empleadaId, foto.url);
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
      throw new NotFoundException(
        `Empleada con ID ${empleadaId} no encontrada`,
      );
    }

    const nuevaFoto = this.fotosExclusivasRepository.create({
      empleadaId,
      url,
      orden,
    });
    return await this.fotosExclusivasRepository.save(nuevaFoto);
  }

  async removePrivatePhoto(id: string): Promise<{ deleted: boolean }> {
    const foto = await this.fotosExclusivasRepository.findOne({
      where: { id },
    });
    if (!foto) {
      throw new NotFoundException(`Foto exclusiva con ID ${id} no encontrada`);
    }
    await this.fotosExclusivasRepository.delete(id);
    await this.discardFileIfUnused(foto.empleadaId, foto.url);
    return { deleted: true };
  }

  // --- GALERIAS: REORDENAR Y MOVER ENTRE PUBLICA Y EXCLUSIVA ---

  /**
   * Reescribe el orden completo de una galeria.
   *
   * No se actualizan posiciones sueltas porque mover una foto recoloca a todas
   * las demas, y `empleada_fotos` tiene un unico (empleada_id, orden): asignar
   * de una en una choca contra ese indice a la primera permuta. Por eso va en
   * una transaccion y en dos pasadas, con un rango temporal alto que ninguna
   * galeria real alcanza.
   */
  async reorderGallery(
    empleadaId: string,
    gallery: PhotoGallery,
    ids: string[],
  ): Promise<{ reordered: number }> {
    const unicos = new Set(ids);
    if (unicos.size !== ids.length) {
      throw new BadRequestException('La lista de fotos trae ids repetidos');
    }

    const actuales = await this.listGallery(empleadaId, gallery);
    if (actuales.length !== ids.length) {
      throw new BadRequestException(
        'La lista debe traer todas las fotos de la galería, en su nuevo orden',
      );
    }
    const conocidos = new Set(actuales.map((foto) => foto.id));
    if (ids.some((id) => !conocidos.has(id))) {
      throw new BadRequestException(
        'Alguna de las fotos no pertenece a esta galería',
      );
    }

    const tabla =
      gallery === 'publica' ? 'empleada_fotos' : 'empleada_fotos_exclusivas';

    await this.dataSource.transaction(async (manager) => {
      const OFFSET = 10_000;
      for (const [index, id] of ids.entries()) {
        await manager.query(
          `UPDATE public.${tabla} SET orden = $1 WHERE id = $2`,
          [OFFSET + index, id],
        );
      }
      for (const [index, id] of ids.entries()) {
        await manager.query(
          `UPDATE public.${tabla} SET orden = $1 WHERE id = $2`,
          [index, id],
        );
      }
    });

    return { reordered: ids.length };
  }

  /**
   * Pasa una foto de una galeria a la otra conservando el archivo.
   *
   * Una foto aprobada como publica que despues se quiere reservar para clientes
   * con membresia obligaba a borrarla y volver a subirla. Aqui solo cambia de
   * tabla: la imagen en R2 es la misma, asi que no se toca.
   */
  async moveBetweenGalleries(
    id: string,
    from: PhotoGallery,
    to: PhotoGallery,
  ): Promise<{ moved: true; id: string; gallery: PhotoGallery }> {
    if (from === to) {
      throw new BadRequestException('La foto ya está en esa galería');
    }

    const origen =
      from === 'publica'
        ? await this.empleadaFotosRepository.findOne({ where: { id } })
        : await this.fotosExclusivasRepository.findOne({ where: { id } });

    if (!origen) {
      throw new NotFoundException(`Foto con ID ${id} no encontrada`);
    }

    const destino = await this.listGallery(origen.empleadaId, to);
    const siguienteOrden = destino.length
      ? Math.max(...destino.map((foto) => foto.orden ?? 0)) + 1
      : 0;

    const creada =
      to === 'publica'
        ? await this.empleadaFotosRepository.save(
            this.empleadaFotosRepository.create({
              empleadaId: origen.empleadaId,
              url: origen.url,
              orden: siguienteOrden,
            }),
          )
        : await this.fotosExclusivasRepository.save(
            this.fotosExclusivasRepository.create({
              empleadaId: origen.empleadaId,
              url: origen.url,
              orden: siguienteOrden,
            }),
          );

    if (from === 'publica') {
      await this.empleadaFotosRepository.delete(id);
    } else {
      await this.fotosExclusivasRepository.delete(id);
    }

    return { moved: true, id: creada.id, gallery: to };
  }

  private async listGallery(
    empleadaId: string,
    gallery: PhotoGallery,
  ): Promise<Array<{ id: string; url: string; orden: number }>> {
    return gallery === 'publica'
      ? this.empleadaFotosRepository.find({
          where: { empleadaId },
          order: { orden: 'ASC' },
        })
      : this.fotosExclusivasRepository.find({
          where: { empleadaId },
          order: { orden: 'ASC' },
        });
  }

  /**
   * Borra el archivo en R2 solo si ya no lo usa nadie mas.
   *
   * La misma imagen puede estar en las dos galerias (por un movimiento) o ser
   * la foto de perfil. Borrar el objeto sin comprobarlo dejaria huecos en el
   * catalogo o un perfil roto.
   */
  private async discardFileIfUnused(
    empleadaId: string,
    url: string,
  ): Promise<void> {
    const [enPublicas, enExclusivas, comoPerfil] = await Promise.all([
      this.empleadaFotosRepository.count({ where: { empleadaId, url } }),
      this.fotosExclusivasRepository.count({ where: { empleadaId, url } }),
      this.empleadasRepository.count({
        where: { id: empleadaId, fotoPerfilUrl: url },
      }),
    ]);

    if (enPublicas > 0 || enExclusivas > 0 || comoPerfil > 0) return;

    try {
      await this.uploadService.deleteFile(url);
    } catch (error) {
      // Un archivo huerfano en R2 no debe tumbar el borrado del registro.
      this.logger.warn(`No se pudo borrar el archivo de R2: ${url}`, error);
    }
  }
}
