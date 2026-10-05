import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { Servicios } from '../entities/service.entity';
import { ServiceOperationEvent } from './entities/service-operation-event.entity';
import {
  availableServiceOperationActions,
  nextServiceOperationState,
  operationStateFromLegacy,
  type ServiceOperationAction,
  type ServiceOperationState,
} from './service-operation-state';

export type OperationActor = {
  userId?: string | null;
  type: 'system' | 'jefe' | 'empleada' | 'chofer' | 'admin';
};

@Injectable()
export class ServiceOperationsService {
  static readonly EMPLOYEE_ACCEPTANCE_MINUTES = 15;
  static readonly EMPLOYEE_ACCEPTANCE_GRACE_MINUTES = 6;

  constructor(
    @InjectRepository(Servicios)
    private readonly services: Repository<Servicios>,
    @InjectRepository(ServiceOperationEvent)
    private readonly events: Repository<ServiceOperationEvent>,
  ) {}

  availableActions(
    service: Pick<Servicios, 'operationalState' | 'estado' | 'horaLlegadaCasa'>,
  ) {
    return availableServiceOperationActions(this.currentState(service));
  }

  currentState(
    service: Pick<Servicios, 'operationalState' | 'estado' | 'horaLlegadaCasa'>,
  ): ServiceOperationState {
    return service.operationalState ?? operationStateFromLegacy(service);
  }

  async transition(
    serviceId: string,
    action: ServiceOperationAction,
    actor: OperationActor,
    options: {
      eventType?: string;
      payload?: Record<string, unknown>;
      patch?: Partial<Servicios>;
      manager?: EntityManager;
    } = {},
  ): Promise<Servicios> {
    const execute = async (manager: EntityManager) => {
      const serviceRepository = manager.getRepository(Servicios);
      const eventRepository = manager.getRepository(ServiceOperationEvent);
      const service = await serviceRepository
        .createQueryBuilder('service')
        .setLock('pessimistic_write')
        .where('service.id = :serviceId', { serviceId })
        .getOne();
      if (!service) throw new NotFoundException('Servicio no encontrado');

      const from = this.currentState(service);
      const to = nextServiceOperationState(from, action);
      if (!to) {
        throw new ConflictException(
          `La acción "${action}" no corresponde al estado operativo "${from}"`,
        );
      }

      Object.assign(service, options.patch ?? {}, { operationalState: to });
      const saved = await serviceRepository.save(service);
      await eventRepository.save(
        eventRepository.create({
          serviceId,
          type: options.eventType ?? action.toUpperCase(),
          fromState: from,
          toState: to,
          actorUserId: actor.userId ?? null,
          actorType: actor.type,
          payload: options.payload ?? {},
        }),
      );
      return saved;
    };

    return options.manager
      ? execute(options.manager)
      : this.services.manager.transaction(execute);
  }

  async transitionMany(
    serviceId: string,
    actions: ServiceOperationAction[],
    actor: OperationActor,
    options: {
      eventTypes?: string[];
      payload?: Record<string, unknown>;
      patch?: Partial<Servicios>;
    } = {},
  ): Promise<Servicios> {
    if (actions.length === 0) {
      const service = await this.services.findOne({ where: { id: serviceId } });
      if (!service) throw new NotFoundException('Servicio no encontrado');
      return service;
    }

    return this.services.manager.transaction(async (manager) => {
      let service: Servicios | null = null;
      for (const [index, action] of actions.entries()) {
        service = await this.transition(serviceId, action, actor, {
          manager,
          eventType: options.eventTypes?.[index],
          payload: options.payload,
          patch: index === actions.length - 1 ? options.patch : undefined,
        });
      }
      return service as Servicios;
    });
  }

  async recordEvent(
    serviceId: string,
    type: string,
    actor: OperationActor,
    payload: Record<string, unknown> = {},
  ): Promise<ServiceOperationEvent> {
    const service = await this.services.findOne({ where: { id: serviceId } });
    if (!service) throw new NotFoundException('Servicio no encontrado');
    const state = this.currentState(service);
    return this.events.save(
      this.events.create({
        serviceId,
        type,
        fromState: state,
        toState: state,
        actorUserId: actor.userId ?? null,
        actorType: actor.type,
        payload,
      }),
    );
  }
}
