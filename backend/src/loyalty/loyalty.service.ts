import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Clientes } from '../clients/entities/client.entity';
import { Servicios } from '../services/entities/service.entity';
import { AdjustPointsDto } from './dto/adjust-points.dto';
import { CreateLoyaltyTierDto } from './dto/create-loyalty-tier.dto';
import { SetClientTierDto } from './dto/set-client-tier.dto';
import { UpdateLoyaltyTierDto } from './dto/update-loyalty-tier.dto';
import { ClientMembership } from './entities/client-membership.entity';
import { LoyaltyTier } from './entities/loyalty-tier.entity';
import { LoyaltyTransaction } from './entities/loyalty-transaction.entity';

@Injectable()
export class LoyaltyService implements OnModuleInit {
  constructor(
    @InjectRepository(LoyaltyTier)
    private readonly tiersRepository: Repository<LoyaltyTier>,
    @InjectRepository(ClientMembership)
    private readonly membershipsRepository: Repository<ClientMembership>,
    @InjectRepository(LoyaltyTransaction)
    private readonly transactionsRepository: Repository<LoyaltyTransaction>,
    @InjectRepository(Clientes)
    private readonly clientsRepository: Repository<Clientes>,
    @InjectRepository(Servicios)
    private readonly servicesRepository: Repository<Servicios>,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.seedTiersIfEmpty();
  }

  async seedTiersIfEmpty() {
    try {
      const count = await this.tiersRepository.count();
      if (count === 0) {
        const defaultTiers = [
          this.tiersRepository.create({
            code: 'bronce',
            name: 'Bronce',
            minSpend: 0,
            earnRate: 0.1,
            sortOrder: 1,
            active: true,
          }),
          this.tiersRepository.create({
            code: 'plata',
            name: 'Plata',
            minSpend: 10000,
            earnRate: 0.1,
            sortOrder: 2,
            active: true,
          }),
          this.tiersRepository.create({
            code: 'oro',
            name: 'Oro',
            minSpend: 30000,
            earnRate: 0.1,
            sortOrder: 3,
            active: true,
          }),
          this.tiersRepository.create({
            code: 'vip',
            name: 'VIP',
            minSpend: 70000,
            earnRate: 0.1,
            sortOrder: 4,
            active: true,
          }),
        ];
        await this.tiersRepository.save(defaultTiers);
      }
    } catch (error) {
      console.error('Error seeding default loyalty tiers:', error);
    }
  }

  async listTiers(): Promise<LoyaltyTier[]> {
    return this.tiersRepository.find({
      order: { minSpend: 'ASC', sortOrder: 'ASC' },
    });
  }

  async createTier(dto: CreateLoyaltyTierDto): Promise<LoyaltyTier> {
    const tier = this.tiersRepository.create({
      code: dto.code.trim().toLowerCase(),
      name: dto.name.trim(),
      minSpend: dto.minSpend,
      earnRate: dto.earnRate ?? 0.1,
      active: dto.active ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });

    try {
      return await this.tiersRepository.save(tier);
    } catch (error) {
      throw new ConflictException(
        `El nivel de membresía "${tier.code}" ya existe`,
      );
    }
  }

  async updateTier(
    id: string,
    dto: UpdateLoyaltyTierDto,
  ): Promise<LoyaltyTier> {
    const tier = await this.tiersRepository.findOne({ where: { id } });
    if (!tier) {
      throw new NotFoundException(`Nivel con ID ${id} no encontrado`);
    }

    if (dto.code !== undefined) tier.code = dto.code.trim().toLowerCase();
    if (dto.name !== undefined) tier.name = dto.name.trim();
    if (dto.minSpend !== undefined) tier.minSpend = dto.minSpend;
    if (dto.earnRate !== undefined) tier.earnRate = dto.earnRate;
    if (dto.active !== undefined) tier.active = dto.active;
    if (dto.sortOrder !== undefined) tier.sortOrder = dto.sortOrder;
    tier.updatedAt = new Date();

    try {
      return await this.tiersRepository.save(tier);
    } catch (error) {
      throw new ConflictException(
        `No se pudo actualizar el nivel "${tier.code}"`,
      );
    }
  }

  async getClientMembership(clienteId: string): Promise<ClientMembership> {
    await this.ensureClientExists(clienteId);
    return this.getOrCreateMembership(clienteId);
  }

  async listClientTransactions(
    clienteId: string,
  ): Promise<LoyaltyTransaction[]> {
    await this.ensureClientExists(clienteId);
    return this.transactionsRepository.find({
      where: { clienteId },
      relations: { servicio: true },
      order: { createdAt: 'DESC' },
    });
  }

  async setClientTier(
    clienteId: string,
    dto: SetClientTierDto,
    assignedByUserId: string,
  ): Promise<ClientMembership> {
    if (!dto.tierId && !dto.tierCode) {
      throw new BadRequestException('Debes proporcionar tierId o tierCode');
    }

    return this.dataSource.transaction(async (manager) => {
      await this.ensureClientExists(clienteId, manager);
      const tier = await this.findTierFromDto(dto, manager);
      const membership = await this.getOrCreateMembership(clienteId, manager);

      membership.tierId = tier.id;
      membership.tier = tier;
      membership.status = 'active';
      membership.assignmentType = 'manual';
      membership.assignedByUserId = assignedByUserId;
      membership.assignedAt = new Date();
      membership.assignmentNotes = dto.notes ?? null;
      membership.updatedAt = new Date();

      const saved = await manager.save(ClientMembership, membership);

      const transaction = manager.create(LoyaltyTransaction, {
        clienteId,
        servicioId: null,
        createdByUserId: assignedByUserId,
        type: 'tier_assignment',
        points: 0,
        amountBasis: null,
        description:
          dto.notes ??
          `Nivel asignado manualmente a ${tier.name} (${tier.code})`,
      });
      await manager.save(LoyaltyTransaction, transaction);

      return this.membershipsRepository.findOneOrFail({
        where: { id: saved.id },
        relations: { tier: true },
      });
    });
  }

  async recalculateClientTier(clienteId: string): Promise<ClientMembership> {
    return this.dataSource.transaction(async (manager) => {
      await this.ensureClientExists(clienteId, manager);
      const membership = await this.getOrCreateMembership(clienteId, manager);
      const tier = await this.findTierForSpend(
        Number(membership.lifetimeSpend),
        manager,
      );

      membership.tierId = tier.id;
      membership.tier = tier;
      membership.assignmentType = 'automatic';
      membership.assignedByUserId = null;
      membership.assignedAt = null;
      membership.assignmentNotes = null;
      membership.updatedAt = new Date();

      const saved = await manager.save(ClientMembership, membership);
      return this.membershipsRepository.findOneOrFail({
        where: { id: saved.id },
        relations: { tier: true },
      });
    });
  }

  async adjustPoints(
    clienteId: string,
    dto: AdjustPointsDto,
    createdByUserId: string,
  ): Promise<ClientMembership> {
    if (dto.points === 0) {
      throw new BadRequestException('El ajuste debe ser distinto de 0');
    }

    return this.dataSource.transaction(async (manager) => {
      await this.ensureClientExists(clienteId, manager);
      const membership = await this.getOrCreateMembership(clienteId, manager);
      const nextBalance = membership.pointsBalance + dto.points;

      if (nextBalance < 0) {
        throw new BadRequestException(
          'El ajuste dejaría el saldo de puntos en negativo',
        );
      }

      membership.pointsBalance = nextBalance;
      membership.lifetimePoints += Math.max(dto.points, 0);
      membership.updatedAt = new Date();
      const saved = await manager.save(ClientMembership, membership);

      const transaction = manager.create(LoyaltyTransaction, {
        clienteId,
        servicioId: null,
        createdByUserId,
        type: 'manual_adjustment',
        points: dto.points,
        amountBasis: null,
        description: dto.description,
      });
      await manager.save(LoyaltyTransaction, transaction);

      return this.membershipsRepository.findOneOrFail({
        where: { id: saved.id },
        relations: { tier: true },
      });
    });
  }

  async awardForFinalizedService(serviceId: string): Promise<{
    duplicate: boolean;
    pointsEarned: number;
    pointsBalance: number;
    tier: LoyaltyTier;
  }> {
    return this.dataSource.transaction(async (manager) => {
      const service = await manager.findOne(Servicios, {
        where: { id: serviceId },
        relations: { cliente: true },
      });

      if (!service) {
        throw new NotFoundException(
          `Servicio con ID ${serviceId} no encontrado`,
        );
      }

      if (service.estado !== 'finalizado') {
        throw new BadRequestException(
          'Solo se pueden otorgar puntos a servicios finalizados',
        );
      }

      const existing = await manager.findOne(LoyaltyTransaction, {
        where: { servicioId: serviceId, type: 'earned' },
      });
      const membership = await this.getOrCreateMembership(
        service.clienteId,
        manager,
      );

      if (existing) {
        const amount = Number(service.totalFinal ?? 0);
        const previousAmount = Number(existing.amountBasis ?? 0);
        const nextPoints = Math.max(
          0,
          Math.floor(amount * membership.tier.earnRate),
        );
        const pointsDelta = nextPoints - existing.points;
        const amountDelta = amount - previousAmount;

        membership.pointsBalance = Math.max(
          0,
          membership.pointsBalance + pointsDelta,
        );
        membership.lifetimePoints = Math.max(
          0,
          membership.lifetimePoints + pointsDelta,
        );
        membership.lifetimeSpend = Math.max(
          0,
          Number(membership.lifetimeSpend) + amountDelta,
        );
        if (membership.assignmentType === 'automatic') {
          const nextTier = await this.findTierForSpend(
            membership.lifetimeSpend,
            manager,
          );
          membership.tierId = nextTier.id;
          membership.tier = nextTier;
        }
        membership.updatedAt = new Date();
        existing.points = nextPoints;
        existing.amountBasis = amount;
        await manager.save(ClientMembership, membership);
        await manager.save(LoyaltyTransaction, existing);
        return {
          duplicate: true,
          pointsEarned: nextPoints,
          pointsBalance: membership.pointsBalance,
          tier: membership.tier,
        };
      }

      const amount = Number(service.totalFinal ?? 0);
      const pointsEarned = Math.max(
        0,
        Math.floor(amount * membership.tier.earnRate),
      );
      const nextLifetimeSpend = membership.lifetimeSpend + amount;

      membership.pointsBalance += pointsEarned;
      membership.lifetimePoints += pointsEarned;
      membership.lifetimeSpend = nextLifetimeSpend;

      if (membership.assignmentType === 'automatic') {
        const nextTier = await this.findTierForSpend(
          nextLifetimeSpend,
          manager,
        );
        membership.tierId = nextTier.id;
        membership.tier = nextTier;
      }

      membership.updatedAt = new Date();
      await manager.save(ClientMembership, membership);

      const transaction = manager.create(LoyaltyTransaction, {
        clienteId: service.clienteId,
        servicioId: service.id,
        createdByUserId: null,
        type: 'earned',
        points: pointsEarned,
        amountBasis: amount,
        description: `Puntos ganados por servicio finalizado ${service.id}`,
      });
      await manager.save(LoyaltyTransaction, transaction);

      return {
        duplicate: false,
        pointsEarned,
        pointsBalance: membership.pointsBalance,
        tier: membership.tier,
      };
    });
  }

  private async getOrCreateMembership(
    clienteId: string,
    manager?: EntityManager,
  ): Promise<ClientMembership> {
    const repo = manager
      ? manager.getRepository(ClientMembership)
      : this.membershipsRepository;

    const existing = await repo.findOne({
      where: { clienteId },
      relations: { tier: true },
    });

    if (existing) return existing;

    const tier = await this.findTierForSpend(0, manager);
    const membership = repo.create({
      clienteId,
      tierId: tier.id,
      tier,
      status: 'active',
      assignmentType: 'automatic',
      pointsBalance: 0,
      lifetimePoints: 0,
      lifetimeSpend: 0,
      assignedByUserId: null,
      assignedAt: null,
      assignmentNotes: null,
    });

    return repo.save(membership);
  }

  private async ensureClientExists(
    clienteId: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = manager
      ? manager.getRepository(Clientes)
      : this.clientsRepository;
    const client = await repo.findOne({ where: { id: clienteId } });
    if (!client) {
      throw new NotFoundException(`Cliente con ID ${clienteId} no encontrado`);
    }
  }

  private async findTierFromDto(
    dto: SetClientTierDto,
    manager: EntityManager,
  ): Promise<LoyaltyTier> {
    const repo = manager.getRepository(LoyaltyTier);
    const where = dto.tierId
      ? { id: dto.tierId, active: true }
      : { code: dto.tierCode!.trim().toLowerCase(), active: true };
    const tier = await repo.findOne({ where });
    if (!tier) {
      throw new NotFoundException(
        'Nivel de membresía no encontrado o inactivo',
      );
    }
    return tier;
  }

  private async findTierForSpend(
    spend: number,
    manager?: EntityManager,
  ): Promise<LoyaltyTier> {
    const repo = manager
      ? manager.getRepository(LoyaltyTier)
      : this.tiersRepository;
    const tier = await repo
      .createQueryBuilder('tier')
      .where('tier.active = :active', { active: true })
      .andWhere('tier.min_spend <= :spend', { spend })
      .orderBy('tier.min_spend', 'DESC')
      .addOrderBy('tier.sort_order', 'DESC')
      .getOne();

    if (!tier) {
      throw new NotFoundException(
        'No hay niveles de membresía activos configurados',
      );
    }

    return tier;
  }
}
