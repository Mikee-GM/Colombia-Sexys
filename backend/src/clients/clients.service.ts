import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Clientes } from './entities/client.entity';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

export type ClientListQuery = {
  search?: string;
  limit?: number;
  offset?: number;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(Clientes)
    private readonly clientesRepository: Repository<Clientes>,
  ) {}

  async create(createClientDto: CreateClientDto): Promise<Clientes> {
    const cliente = this.clientesRepository.create(createClientDto);
    return this.clientesRepository.save(cliente);
  }

  /**
   * Paginado siempre: la tabla de clientes crece con cada conversacion de
   * Telegram y devolverla entera acabaria tumbando el panel.
   */
  async findAll(query: ClientListQuery = {}) {
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Math.trunc(query.limit ?? DEFAULT_LIMIT)),
    );
    const offset = Math.max(0, Math.trunc(query.offset ?? 0));
    const search = query.search?.trim();

    /*
     * Se busca por nombre y tambien por id de Telegram.
     *
     * En la practica al cliente se le identifica por ese numero --es lo unico
     * que aparece en los avisos al jefe y en las fichas de servicio-- y antes
     * pegarlo en el buscador no devolvia nada: solo se miraba el nombre, que
     * ademas muchos clientes no tienen puesto.
     */
    const where = search
      ? [
          { nombreTelegram: ILike(`%${search}%`) },
          ...(/^\d+$/.test(search)
            ? [{ telegramChatId: ILike(`%${search}%`) }]
            : []),
        ]
      : undefined;

    const [items, total] = await this.clientesRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return { items, total, limit, offset };
  }

  async findOne(id: string): Promise<Clientes> {
    const cliente = await this.clientesRepository.findOne({ where: { id } });
    if (!cliente) {
      throw new NotFoundException(`Cliente con ID ${id} no encontrado`);
    }
    return cliente;
  }

  async update(id: string, updateClientDto: UpdateClientDto) {
    await this.findOne(id);
    await this.clientesRepository.update(id, updateClientDto);
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.clientesRepository.delete(id);
    return { deleted: true };
  }
}
