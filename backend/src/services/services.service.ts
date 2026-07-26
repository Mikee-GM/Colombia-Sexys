import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
  forwardRef,
  OnModuleInit,
  OnModuleDestroy,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context, Markup } from 'telegraf';
import { Servicios } from './entities/service.entity';
import { Viajes } from '../trips/entities/trip.entity';
import { RealtimeEventsService } from '../realtime/realtime.service';
import { TelegramService } from '../telegram/telegram.service';
import { Empleadas } from '../employees/entities/employee.entity';
import { Usuarios } from '../users/entities/user.entity';
import { Choferes } from '../drivers/entities/driver.entity';
import { AiMessageService } from '../ai/ai-message.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { OfficeLiquidationSyncService } from '../liquidations/office-liquidation-sync.service';
import { EmployeeCashObligation } from '../transport-operations/entities/employee-cash-obligation.entity';
import { ConfigService } from '@nestjs/config';
import { ConversacionesTelegram } from '../telegram-conversations/entities/telegram-conversation.entity';
import {
  estimateServiceEnd,
  estimateTravelMinutes,
} from './service-scheduling';
import { DisciplineService } from '../discipline/discipline.service';

@Injectable()
export class ServicesService implements OnModuleInit, OnModuleDestroy {
  private waitTimeouts = new Map<string, NodeJS.Timeout>();
  private dispatchTimeouts = new Map<string, NodeJS.Timeout>();
  private maintenanceInterval?: NodeJS.Timeout;

  clearDispatchTimeout(viajeId: string) {
    const existing = this.dispatchTimeouts.get(viajeId);
    console.log(
      `[clearDispatchTimeout] Viaje: ${viajeId}, Existe timeout: ${!!existing}`,
    );
    if (existing) {
      clearTimeout(existing);
      this.dispatchTimeouts.delete(viajeId);
    }
  }

  constructor(
    @InjectRepository(Servicios)
    private readonly serviciosRepository: Repository<Servicios>,
    @InjectRepository(Viajes)
    private readonly viajesRepository: Repository<Viajes>,
    @InjectRepository(Choferes)
    private readonly choferesRepository: Repository<Choferes>,
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    @InjectRepository(ConversacionesTelegram)
    private readonly conversationsRepository: Repository<ConversacionesTelegram>,
    private readonly realtimeEventsService: RealtimeEventsService,
    @InjectBot() private readonly bot: Telegraf<Context>,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegramService: TelegramService,
    private readonly aiMessageService: AiMessageService,
    private readonly loyaltyService: LoyaltyService,
    private readonly liquidationSync: OfficeLiquidationSyncService,
    private readonly configService: ConfigService,
    private readonly disciplineService: DisciplineService,
  ) {}

  private estimatedEnd(service: Servicios): Date | null {
    return estimateServiceEnd(
      service.horaInicioServicio,
      service.duracionPactadaHoras,
    );
  }

  private async recordAgencyMessage(
    service: Servicios,
    message: string,
  ): Promise<void> {
    await this.conversationsRepository.save(
      this.conversationsRepository.create({
        clienteId: service.clienteId,
        servicioId: service.id,
        bookingSessionId: null,
        emisor: 'ia',
        mensaje: message,
        iaActiva: false,
      }),
    );
  }

  private travelMinutes(from: Servicios, to: Servicios): number {
    const speed = Math.max(
      1,
      this.configService.get<number>('SCHEDULE_TRAVEL_SPEED_KMH') ?? 25,
    );
    const preparation = Math.max(
      0,
      this.configService.get<number>('SCHEDULE_PREPARATION_MINUTES') ?? 10,
    );
    return estimateTravelMinutes(
      {
        latitude: Number(from.ubicacionClienteLat),
        longitude: Number(from.ubicacionClienteLng),
      },
      {
        latitude: Number(to.ubicacionClienteLat),
        longitude: Number(to.ubicacionClienteLng),
      },
      speed,
      preparation,
    );
  }

  async reserveNext(createData: Partial<Servicios>): Promise<Servicios> {
    if (!createData.empleadaId) {
      throw new BadRequestException('Falta la empleada');
    }
    await this.disciplineService.assertOperationallyAllowed(
      'employee',
      createData.empleadaId,
    );
    if (createData.clienteId) {
      await this.disciplineService.assertOperationallyAllowed(
        'client',
        createData.clienteId,
      );
    }
    return this.serviciosRepository.manager.transaction(async (manager) => {
      await manager
        .getRepository(Empleadas)
        .createQueryBuilder('employee')
        .setLock('pessimistic_write')
        .where('employee.id = :id', { id: createData.empleadaId })
        .getOneOrFail();
      const active = await manager.findOne(Servicios, {
        where: { empleadaId: createData.empleadaId, estado: 'en_curso' },
        order: { createdAt: 'DESC' },
      });
      if (!active) {
        return manager.save(Servicios, manager.create(Servicios, createData));
      }
      const existing = await manager.findOne(Servicios, {
        where: [
          {
            empleadaId: createData.empleadaId,
            servicioPrevioId: active.id,
            estado: 'pendiente',
          },
          {
            empleadaId: createData.empleadaId,
            servicioPrevioId: active.id,
            estado: 'agendado',
          },
        ],
      });
      if (existing) {
        throw new ConflictException(
          'La empleada ya tiene reservado su siguiente servicio',
        );
      }
      const availableAt = this.estimatedEnd(active) ?? new Date();
      const draft = manager.create(Servicios, {
        ...createData,
        servicioPrevioId: active.id,
        horaDisponibilidadEstimada: availableAt,
      });
      draft.horaInicioEstimada = new Date(
        availableAt.getTime() + this.travelMinutes(active, draft) * 60_000,
      );
      return manager.save(Servicios, draft);
    });
  }

  private getServiceTopic(servicio: Servicios) {
    const chatId =
      servicio.jefe?.grupoTelegramId ||
      servicio.empleada?.jefe?.grupoTelegramId;
    const threadId = Number(servicio.telegramThreadId);
    if (!chatId || !Number.isInteger(threadId) || threadId <= 0) return null;
    return { chatId, threadId };
  }

  private async deleteServiceTopic(servicio: Servicios): Promise<void> {
    const topic = this.getServiceTopic(servicio);
    if (!topic) return;
    try {
      await this.bot.telegram.deleteForumTopic(topic.chatId, topic.threadId);
      await this.serviciosRepository.update(servicio.id, {
        telegramThreadId: null,
      });
    } catch (error) {
      console.error(
        `[ServicesService] No se pudo eliminar el tema ${topic.threadId} del servicio ${servicio.id}:`,
        error,
      );
    }
  }

  async create(createServiceDto: any): Promise<Servicios> {
    // Si no tiene jefeId especificado, asignamos el jefe correspondiente a la empleada
    if (createServiceDto.empleadaId && !createServiceDto.jefeId) {
      try {
        const empleadasRepository =
          this.serviciosRepository.manager.getRepository(Empleadas);
        const emp = await empleadasRepository.findOne({
          where: { id: createServiceDto.empleadaId },
        });
        if (emp) {
          let assignedJefeId = emp.jefeId;
          if (emp.jefeId) {
            const mainJefe = await this.usuariosRepository.findOne({
              where: { id: emp.jefeId, activo: true },
            });
            if (!mainJefe || !mainJefe.disponible) {
              if (emp.jefeSecundarioId) {
                const secJefe = await this.usuariosRepository.findOne({
                  where: { id: emp.jefeSecundarioId, activo: true },
                });
                if (secJefe && secJefe.disponible) {
                  assignedJefeId = emp.jefeSecundarioId;
                }
              }
            }
          }
          if (assignedJefeId) {
            createServiceDto.jefeId = assignedJefeId;
          }
        }
      } catch (err) {
        console.error('Error auto-assigning jefeId for employee:', err);
      }
    }

    const servicioGuardado = await this.reserveNext(createServiceDto);

    // Emit event to Jefes in real-time via SSE
    try {
      const serviceWithRelations = await this.serviciosRepository.findOne({
        where: { id: servicioGuardado.id },
        relations: { cliente: true, empleada: true },
      });
      if (serviceWithRelations) {
        this.realtimeEventsService.emitToBoss(serviceWithRelations.jefeId, {
          type: 'service_requested',
          data: serviceWithRelations,
        });
      }
    } catch (sseErr) {
      console.error('Error emitting SSE event for new service:', sseErr);
    }

    // Send Telegram notification to Jefes & Admins
    try {
      await this.telegramService.notifyJefesNewService(servicioGuardado.id);
    } catch (telegramErr) {
      console.error(
        'Error notifying jefes via Telegram for new service:',
        telegramErr,
      );
    }

    return servicioGuardado;
  }

  async getPending(actor?: Usuarios): Promise<Servicios[]> {
    return await this.serviciosRepository.find({
      where:
        actor?.rol === 'jefe'
          ? [
              { estado: 'pendiente', jefeId: actor.id },
              { estado: 'pendiente', empleada: { jefeId: actor.id } },
              {
                estado: 'pendiente',
                empleada: { jefeSecundarioId: actor.id },
              },
            ]
          : { estado: 'pendiente' },
      relations: {
        cliente: true,
        empleada: true,
        participantes: { employee: true },
        viajes: { passengers: { employee: true } },
        pagos: true,
      },
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(actor?: Usuarios): Promise<Servicios[]> {
    return await this.serviciosRepository.find({
      where:
        actor?.rol === 'jefe'
          ? [
              { jefeId: actor.id },
              { empleada: { jefeId: actor.id } },
              { empleada: { jefeSecundarioId: actor.id } },
            ]
          : undefined,
      relations: {
        cliente: true,
        empleada: true,
        participantes: { employee: true },
        viajes: { passengers: { employee: true } },
        pagos: true,
      },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Servicios> {
    const servicio = await this.serviciosRepository.findOne({
      where: { id },
      relations: {
        cliente: true,
        empleada: true,
        participantes: { employee: true },
        viajes: { passengers: { employee: true } },
        pagos: true,
      },
    });
    if (!servicio) {
      throw new NotFoundException(`Servicio con ID ${id} no encontrado`);
    }
    return servicio;
  }

  async findOneForActor(id: string, actor: Usuarios): Promise<Servicios> {
    const service = await this.findOne(id);
    this.assertActorCanManageService(service, actor);
    return service;
  }

  private assertActorCanManageService(
    service: Servicios,
    actor: Usuarios,
  ): void {
    if (actor.rol === 'admin') return;
    if (
      actor.rol !== 'jefe' ||
      (service.jefeId !== actor.id &&
        service.empleada?.jefeId !== actor.id &&
        service.empleada?.jefeSecundarioId !== actor.id)
    ) {
      throw new ConflictException('No puedes gestionar este servicio');
    }
  }

  async update(id: string, updateData: any): Promise<Servicios> {
    await this.serviciosRepository.update(id, updateData);
    const service = await this.findOne(id);
    if (updateData.duracionPactadaHoras !== undefined) {
      await this.recalculateScheduledSuccessor(id);
    }
    if (service.estado === 'finalizado') {
      await this.liquidationSync.syncOfficeRecord(id);
    }
    return service;
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const servicio = await this.findOne(id);
    await this.serviciosRepository.remove(servicio);
    return { deleted: true };
  }

  async aceptar(
    id: string,
    jefeId: string,
    tipoTransporte: 'chofer' | 'uber' = 'chofer',
    bossNotes?: string,
  ): Promise<Servicios & { uberLink?: string; viajeId?: string }> {
    const servicio = await this.serviciosRepository.findOne({
      where: { id },
      relations: { cliente: true, empleada: { usuario: true } },
    });

    if (!servicio) {
      throw new NotFoundException('Servicio no encontrado');
    }

    if (servicio.estado !== 'pendiente') {
      throw new ConflictException(
        'El servicio ya no está pendiente de aprobación',
      );
    }
    if (servicio.serviceType === 'grupal') {
      throw new ConflictException(
        'Los servicios grupales se inician desde su organizador',
      );
    }

    // Validar que el usuario sea jefe o admin
    const user = await this.serviciosRepository.manager
      .getRepository(Usuarios)
      .findOne({
        where: { id: jefeId },
      });

    if (!user || (user.rol !== 'jefe' && user.rol !== 'admin')) {
      throw new ConflictException(
        'No tienes permisos para autorizar este servicio',
      );
    }
    this.assertActorCanManageService(servicio, user);
    await this.disciplineService.assertOperationallyAllowed(
      'employee',
      servicio.empleadaId,
    );
    await this.disciplineService.assertOperationallyAllowed(
      'client',
      servicio.clienteId,
    );

    servicio.jefeId = jefeId;
    servicio.notasJefe = bossNotes?.trim() || null;
    if (servicio.servicioPrevioId) {
      servicio.estado = 'agendado';
      servicio.transporteAgendado = tipoTransporte;
      await this.serviciosRepository.save(servicio);
      this.realtimeEventsService.emitToBoss(servicio.jefeId, {
        type: 'service_scheduled',
        data: servicio,
      });
      const employeeChatId = servicio.empleada?.usuario?.telegramChatId;
      if (employeeChatId && servicio.notasJefe) {
        await this.bot.telegram.sendMessage(
          employeeChatId,
          `📝 Notas del jefe para tu siguiente servicio:\n${servicio.notasJefe}`,
        );
      }
      return servicio;
    }

    // 1. Actualizar estado del servicio a 'en_curso'
    servicio.estado = 'en_curso';
    if (!servicio.horaInicioServicio) {
      servicio.horaInicioServicio = new Date();
    }
    await this.serviciosRepository.save(servicio);

    // Actualizar disponibilidad de la empleada a false (ocupada)
    if (servicio.empleadaId) {
      await this.serviciosRepository.manager
        .getRepository(Empleadas)
        .update(servicio.empleadaId, { disponible: false });
    }

    // 2. Crear viaje (viaje de ida para la empleada) sin chofer asignado inicialmente
    const nuevoViaje = this.viajesRepository.create({
      servicioId: servicio.id,
      choferId: null,
      tipo: 'ida',
      zona: 'domicilio',
      tarifa: tipoTransporte === 'uber' ? 0 : this.driverPayoutFor(servicio),
      driverPayout:
        tipoTransporte === 'uber' ? 0 : this.driverPayoutFor(servicio),
      estado: tipoTransporte === 'uber' ? 'aceptado' : 'notificado',
      proveedorTransporte: tipoTransporte,
    });
    const viajeGuardado = await this.viajesRepository.save(nuevoViaje);

    // 3. Notificar a Jefes via SSE
    this.realtimeEventsService.emitToBoss(servicio.jefeId, {
      type: 'service_accepted',
      data: { id: servicio.id, viajeId: viajeGuardado.id },
    });

    // 4. Notificar a Empleada via SSE
    this.realtimeEventsService.emitToEmployee(servicio.empleadaId, {
      type: 'new_service',
      data: servicio,
    });

    // Notificar a la empleada por Telegram si tiene telegramChatId
    const empUser = servicio.empleada?.usuario;
    if (
      empUser &&
      empUser.telegramChatId &&
      empUser.telegramChatId !== '111111111'
    ) {
      try {
        const targetChatId = empUser.telegramChatId;
        const threadId = undefined;

        if (targetChatId) {
          const inlineButtons: any[] = [
            [
              Markup.button.callback(
                '🏁 Finalizar Servicio',
                `finalizar_servicio:${servicio.id}`,
              ),
            ],
          ];

          inlineButtons.push([
            Markup.button.callback(
              '➕ Agregar Extra',
              `agregar_extra_list:${servicio.id}`,
            ),
          ]);

          if (tipoTransporte === 'uber') {
            inlineButtons.unshift(
              [
                Markup.button.url(
                  'Abrir Uber',
                  this.buildUberLinkForTrip(servicio, 'ida'),
                ),
              ],
              [
                Markup.button.callback(
                  'Ya estoy en el Uber',
                  `eu:${viajeGuardado.id}:i`,
                ),
                Markup.button.callback('Ya llegué', `eu:${viajeGuardado.id}:f`),
              ],
            );
          }

          const empMsg = await this.bot.telegram.sendMessage(
            targetChatId,
            `💼 *¡Servicio en Curso!* 🟢\n\n` +
              `• *Cliente:* ${servicio.cliente?.nombreTelegram || 'Desconocido'}\n` +
              `• *Duración:* ${servicio.duracionPactadaHoras} horas\n` +
              `• *Método de Pago:* ${servicio.metodoPago.toUpperCase()}\n\n` +
              (servicio.notasJefe
                ? `• *Notas del jefe:* ${servicio.notasJefe}\n\n`
                : '') +
              `Cuando hayas terminado el servicio, presiona el botón de abajo para finalizarlo:`,
            {
              message_thread_id: threadId,
              parse_mode: 'Markdown',
              ...Markup.inlineKeyboard(inlineButtons),
            },
          );
          servicio.telegramEmpleadaMensajeId = empMsg.message_id.toString();
          await this.serviciosRepository.save(servicio);
        }
      } catch (telegramErr) {
        console.error(
          `Error al enviar notificación de Telegram a la empleada (chatId: ${empUser.telegramChatId}):`,
          telegramErr.message || telegramErr,
        );
      }
    }

    // Notificar al cliente por Telegram si tiene telegramChatId
    if (servicio.cliente?.telegramChatId) {
      try {
        const clientMessage = await this.aiMessageService.generate(
          'service_accepted',
          { employeeName: servicio.empleada.nombreArtistico },
          'Oyeee, sí puedo ir contigo, nos vemos en un ratico 😊',
        );
        await this.bot.telegram.sendMessage(
          servicio.cliente.telegramChatId,
          clientMessage,
        );
      } catch (telegramErr) {
        console.error(
          `Error al enviar notificación de aceptación al cliente (chatId: ${servicio.cliente.telegramChatId}):`,
          telegramErr.message || telegramErr,
        );
      }
    }

    // 5. Iniciar despacho de choferes por proximidad
    let uberLink: string | undefined;
    if (tipoTransporte === 'uber') {
      uberLink = undefined;
    } else {
      try {
        await this.dispatchViaje(viajeGuardado.id);
      } catch (dispatchErr) {
        console.error(
          'Error al iniciar despacho de choferes por proximidad:',
          dispatchErr,
        );
      }
    }

    return {
      ...servicio,
      uberLink,
      viajeId: viajeGuardado.id,
    } as any;
  }

  async rechazar(id: string, jefeId: string): Promise<Servicios> {
    const servicio = await this.serviciosRepository.findOne({
      where: { id },
      relations: { empleada: true, jefe: true, cliente: true },
    });

    if (!servicio) {
      throw new NotFoundException('Servicio no encontrado');
    }

    if (servicio.estado !== 'pendiente') {
      throw new ConflictException(
        'El servicio ya no está pendiente de aprobación',
      );
    }

    // Validar que el usuario sea jefe o admin
    const user = await this.serviciosRepository.manager
      .getRepository(Usuarios)
      .findOne({
        where: { id: jefeId },
      });

    if (!user || (user.rol !== 'jefe' && user.rol !== 'admin')) {
      throw new ConflictException(
        'No tienes permisos para autorizar este servicio',
      );
    }
    this.assertActorCanManageService(servicio, user);

    // 1. Actualizar estado del servicio a 'cancelado'
    servicio.estado = 'cancelado';
    servicio.jefeId = jefeId;
    await this.serviciosRepository.save(servicio);

    // Una reserva rechazada no vuelve disponible a quien aún sigue en servicio.
    const activeService = await this.serviciosRepository.findOne({
      where: { empleadaId: servicio.empleadaId, estado: 'en_curso' },
    });
    if (servicio.empleadaId && !activeService) {
      await this.serviciosRepository.manager
        .getRepository(Empleadas)
        .update(servicio.empleadaId, { disponible: true });
    }

    // 2. Notificar a Jefes via SSE
    this.realtimeEventsService.emitToBoss(servicio.jefeId, {
      type: 'service_rejected',
      data: { id: servicio.id },
    });

    // 3. Eliminar el tema (hilo) del grupo de Telegram si existe
    if (servicio.telegramThreadId && servicio.jefe?.grupoTelegramId) {
      try {
        await this.bot.telegram.deleteForumTopic(
          servicio.jefe.grupoTelegramId,
          parseInt(servicio.telegramThreadId, 10),
        );
      } catch (err) {
        console.error('Error deleting forum topic on reject:', err);
      }
    }

    // 4. Notificar al cliente via Telegram con opciones de reinicio
    if (servicio.clienteTelegramId) {
      try {
        const clientMessage = await this.aiMessageService.generate(
          'service_rejected',
          { employeeName: servicio.empleada?.nombreArtistico },
          'Qué pena contigo, esta vez no voy a poder ir 😕',
        );
        await this.bot.telegram.sendMessage(
          servicio.clienteTelegramId,
          clientMessage,
        );
      } catch (err) {
        console.error('Error notifying client of rejected service:', err);
      }
    }

    return servicio;
  }

  async recalculateScheduledSuccessor(activeServiceId: string): Promise<void> {
    const active = await this.serviciosRepository.findOneBy({
      id: activeServiceId,
    });
    if (!active) return;
    const next = await this.serviciosRepository.findOne({
      where: [
        { servicioPrevioId: active.id, estado: 'pendiente' },
        { servicioPrevioId: active.id, estado: 'agendado' },
      ],
      relations: { cliente: true, empleada: true },
    });
    if (!next) return;
    const availableAt = this.estimatedEnd(active) ?? new Date();
    next.horaDisponibilidadEstimada = availableAt;
    next.horaInicioEstimada = new Date(
      availableAt.getTime() + this.travelMinutes(active, next) * 60_000,
    );
    await this.serviciosRepository.save(next);
    this.realtimeEventsService.emitToBoss(next.jefeId, {
      type: 'scheduled_service_eta_updated',
      data: next,
    });
    if (next.cliente?.telegramChatId) {
      const eta = next.horaInicioEstimada.toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Mexico_City',
      });
      const message = await this.aiMessageService.generateAgencyMessage(
        'scheduled_eta_updated',
        { employeeName: next.empleada?.nombreArtistico, eta },
        `Soy el asistente de la agencia. La cita anterior se extendió; la nueva hora aproximada de llegada de ${next.empleada?.nombreArtistico || 'la empleada'} es ${eta}.`,
      );
      await this.bot.telegram
        .sendMessage(next.cliente.telegramChatId, message)
        .catch(() => undefined);
      await this.recordAgencyMessage(next, message);
    }
  }

  async activateScheduledSuccessor(
    completedServiceId: string,
  ): Promise<{ hasSuccessor: boolean; sameLocation: boolean }> {
    const completed = await this.serviciosRepository.findOneBy({
      id: completedServiceId,
    });
    if (!completed) return { hasSuccessor: false, sameLocation: false };
    const next = await this.serviciosRepository.findOne({
      where: { servicioPrevioId: completed.id, estado: 'agendado' },
      relations: { cliente: true, empleada: { usuario: true }, jefe: true },
    });
    if (!next) return { hasSuccessor: false, sameLocation: false };

    const sameLocation = Boolean(
      completed.presetLocationId &&
      next.presetLocationId === completed.presetLocationId,
    );
    if (sameLocation) {
      next.estado = 'en_curso';
      next.horaInicioServicio = new Date();
      next.servicioPrevioId = null;
      next.horaDisponibilidadEstimada = next.horaInicioServicio;
      next.horaInicioEstimada = next.horaInicioServicio;
      await this.serviciosRepository.save(next);
      await this.notifyScheduledServiceStarted(next.id);
      if (next.cliente?.telegramChatId) {
        const message = await this.aiMessageService.generateAgencyMessage(
          'employee_available',
          { employeeName: next.empleada?.nombreArtistico },
          `Soy el asistente de la agencia. ${next.empleada?.nombreArtistico || 'La empleada'} ya está disponible y se encuentra en la misma ubicación.`,
        );
        await this.bot.telegram.sendMessage(
          next.cliente.telegramChatId,
          message,
        );
        await this.recordAgencyMessage(next, message);
      }
    } else {
      const provider = next.transporteAgendado ?? 'chofer';
      const trip = await this.viajesRepository.save(
        this.viajesRepository.create({
          servicioId: next.id,
          choferId: null,
          tipo: 'ida',
          zona: 'domicilio',
          tarifa: provider === 'uber' ? 0 : this.driverPayoutFor(next),
          driverPayout: provider === 'uber' ? 0 : this.driverPayoutFor(next),
          estado: provider === 'uber' ? 'aceptado' : 'notificado',
          proveedorTransporte: provider,
        }),
      );
      if (provider === 'chofer') {
        await this.dispatchViaje(trip.id);
      } else {
        const uberLink = this.buildUberLinkForTrip(next, 'ida');
        const topic = this.getServiceTopic(next);
        if (topic) {
          await this.bot.telegram.sendMessage(
            topic.chatId,
            'La empleada terminó el servicio anterior. Solicita ahora el Uber hacia el siguiente servicio.',
            {
              message_thread_id: topic.threadId,
              ...Markup.inlineKeyboard([
                [Markup.button.url('📱 Pedir Uber', uberLink)],
              ]),
            },
          );
        }
        const employeeChatId = next.empleada?.usuario?.telegramChatId;
        if (employeeChatId) {
          await this.bot.telegram.sendMessage(
            employeeChatId,
            'Tu siguiente servicio está listo. Usa este enlace para solicitar el Uber.',
            {
              ...Markup.inlineKeyboard([
                [Markup.button.url('📱 Abrir Uber', uberLink)],
                [
                  Markup.button.callback(
                    'Ya estoy en el Uber',
                    `eu:${trip.id}:i`,
                  ),
                  Markup.button.callback('Ya llegué', `eu:${trip.id}:f`),
                ],
              ]),
            },
          );
        }
      }
      if (next.cliente?.telegramChatId) {
        const message = await this.aiMessageService.generateAgencyMessage(
          'employee_en_route',
          { employeeName: next.empleada?.nombreArtistico },
          `Soy el asistente de la agencia. ${next.empleada?.nombreArtistico || 'La empleada'} terminó su servicio anterior y ahora va en camino.`,
        );
        await this.bot.telegram.sendMessage(
          next.cliente.telegramChatId,
          message,
        );
        await this.recordAgencyMessage(next, message);
      }
    }
    this.realtimeEventsService.emitToBoss(next.jefeId, {
      type: sameLocation
        ? 'scheduled_service_started'
        : 'scheduled_service_transport_started',
      data: next,
    });
    return { hasSuccessor: true, sameLocation };
  }

  async notifyScheduledServiceStarted(serviceId: string): Promise<void> {
    const service = await this.serviciosRepository.findOne({
      where: { id: serviceId },
      relations: { cliente: true, empleada: { usuario: true } },
    });
    const chatId = service?.empleada?.usuario?.telegramChatId;
    if (!service || !chatId) return;
    await this.bot.telegram.sendMessage(
      chatId,
      `💼 *Siguiente servicio iniciado*\n\n` +
        `• *Cliente:* ${service.cliente?.nombreTelegram || 'Desconocido'}\n` +
        `• *Duración:* ${service.duracionPactadaHoras} horas\n` +
        (service.notasJefe ? `• *Notas del jefe:* ${service.notasJefe}\n` : ''),
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              '🏁 Finalizar Servicio',
              `finalizar_servicio:${service.id}`,
            ),
          ],
          [
            Markup.button.callback(
              '➕ Agregar Extra',
              `agregar_extra_list:${service.id}`,
            ),
          ],
        ]),
      },
    );
  }

  onModuleInit() {
    // Check every 60 seconds
    this.maintenanceInterval = setInterval(() => {
      this.checkActiveServicesForExtension().catch((err) =>
        console.error('Error checking active services for extension:', err),
      );
      this.processReturnTransportReminders().catch((err) =>
        console.error('Error checking return transport reminders:', err),
      );
    }, 60000);
  }

  onModuleDestroy() {
    if (this.maintenanceInterval) clearInterval(this.maintenanceInterval);
  }

  async checkActiveServicesForExtension() {
    const activeServices = await this.serviciosRepository.find({
      where: {
        estado: 'en_curso',
        notificacionExtensionEnviada: false,
      },
      relations: { empleada: { usuario: true } },
    });

    const now = Date.now();
    for (const service of activeServices) {
      // Solo notificar si el metodo de pago es tarjeta o transferencia
      if (
        service.metodoPago !== 'tarjeta' &&
        service.metodoPago !== 'transferencia'
      ) {
        continue;
      }
      if (
        !service.horaInicioServicio ||
        !service.empleada?.usuario?.telegramChatId
      ) {
        continue;
      }

      const durationMs = Number(service.duracionPactadaHoras) * 60 * 60 * 1000;
      const endTime = service.horaInicioServicio.getTime() + durationMs;
      const notificationTime = endTime - 15 * 60 * 1000; // 15 minutes before scheduled end

      if (now >= notificationTime) {
        // Mark as sent to prevent multiple triggers
        service.notificacionExtensionEnviada = true;
        await this.serviciosRepository.save(service);

        try {
          const targetChatId = service.empleada.usuario.telegramChatId;
          const threadId = undefined;

          if (targetChatId) {
            await this.bot.telegram.sendMessage(
              targetChatId,
              `⏳ *Aviso de Finalización* ⏳\n\n` +
                `Tu servicio está programado para finalizar en aproximadamente 15 minutos.\n\n` +
                `¿Deseas extender el tiempo del servicio?`,
              {
                message_thread_id: threadId,
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                  [
                    Markup.button.callback(
                      '➕ 1 Hora',
                      `extender_servicio:${service.id}:1`,
                    ),
                    Markup.button.callback(
                      '➕ 2 Horas',
                      `extender_servicio:${service.id}:2`,
                    ),
                  ],
                  [
                    Markup.button.callback(
                      '➕ 3 Horas',
                      `extender_servicio:${service.id}:3`,
                    ),
                    Markup.button.callback(
                      '❌ No extender',
                      `no_extender_servicio:${service.id}`,
                    ),
                  ],
                ]),
              },
            );
          }
        } catch (err) {
          console.error(
            `Error sending extension prompt to employee (chatId: ${service.empleada.usuario.telegramChatId}):`,
            err,
          );
        }
      }
    }
  }

  async dispatchViaje(viajeId: string): Promise<void> {
    this.clearDispatchTimeout(viajeId);

    const viaje = await this.viajesRepository.findOne({
      where: { id: viajeId },
      relations: {
        servicio: {
          empleada: { usuario: true },
          cliente: true,
          jefe: true,
        },
        passengers: { employee: true },
      },
    });

    if (!viaje) {
      console.error(`[dispatchViaje] Viaje ${viajeId} no encontrado.`);
      return;
    }

    // Si el viaje ya no está en estado "notificado", detenemos el despacho
    if (viaje.estado !== 'notificado') {
      return;
    }

    let searchLat: number;
    let searchLng: number;

    if (viaje.tipo === 'ida') {
      const passenger = viaje.passengers?.[0]?.employee;
      const employeeLat =
        passenger?.ubicacionLat ?? viaje.servicio?.empleada?.ubicacionLat;
      const employeeLng =
        passenger?.ubicacionLng ?? viaje.servicio?.empleada?.ubicacionLng;
      if (employeeLat == null || employeeLng == null) {
        console.error(
          `[dispatchViaje] Ubicación de empleada faltante para viaje ${viajeId}.`,
        );
        return;
      }
      searchLat = employeeLat;
      searchLng = employeeLng;
    } else {
      if (
        !viaje.servicio?.ubicacionClienteLat ||
        !viaje.servicio?.ubicacionClienteLng
      ) {
        console.error(
          `[dispatchViaje] Ubicación de cliente faltante para viaje de regreso ${viajeId}.`,
        );
        return;
      }
      searchLat = viaje.servicio.ubicacionClienteLat;
      searchLng = viaje.servicio.ubicacionClienteLng;
    }

    // Obtener lista de IDs de choferes ya notificados en este viaje
    const notificadosIds: string[] = Array.isArray(viaje.choferesNotificados)
      ? viaje.choferesNotificados
      : [];

    // Buscar el chofer disponible más cercano que no haya sido notificado
    const query = this.choferesRepository
      .createQueryBuilder('chofer')
      .innerJoinAndSelect('chofer.usuario', 'usuario')
      .where('chofer.disponible = :disponible', { disponible: true })
      .andWhere('usuario.activo = :usuarioActivo', { usuarioActivo: true })
      .andWhere('usuario.telegramChatId IS NOT NULL')
      .andWhere('chofer.ubicacionLat IS NOT NULL')
      .andWhere('chofer.ubicacionLng IS NOT NULL');
    query.andWhere(
      `NOT EXISTS (
        SELECT 1 FROM disciplinary_sanctions ds
        WHERE ds.subject_type = 'driver'
          AND ds.subject_id = chofer.id
          AND ds.status = 'active'
          AND ds.starts_at <= now()
          AND (ds.type = 'permanent_ban' OR ds.ends_at > now())
      )`,
    );

    if (notificadosIds.length > 0) {
      query.andWhere('chofer.id NOT IN (:...notificadosIds)', {
        notificadosIds,
      });
    }

    const result = await query
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
      .setParameter('lat', searchLat)
      .setParameter('lng', searchLng)
      .orderBy('distancia', 'ASC')
      .getRawAndEntities();

    if (result.entities.length === 0) {
      console.log(
        `[dispatchViaje] No hay choferes disponibles para el viaje ${viajeId}.`,
      );
      await this.notifyNoDriversAvailable(viaje);
      return;
    }

    const nearestDriver = result.entities[0];
    const nearestRaw = result.raw[0];
    const distancia = parseFloat(nearestRaw.distancia);

    // Actualizar viaje con el chofer asignado temporalmente, agregar a la lista de notificados
    viaje.choferId = nearestDriver.id;
    viaje.choferesNotificados = [...notificadosIds, nearestDriver.id];
    viaje.horaNotificacion = new Date();
    await this.viajesRepository.save(viaje);

    // Enviar mensaje al chofer por privado
    const driverChatId = nearestDriver.usuario.telegramChatId;
    if (driverChatId) {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${searchLat},${searchLng}`;
      let messageText = '';

      if (viaje.tipo === 'ida') {
        messageText =
          `📢 *¡Oferta de Viaje Disponible (Ida)!* 🚗\n\n` +
          `• *Pasajera (Empleada):* ${viaje.servicio.empleada.nombreArtistico}\n` +
          `• *Punto de Recogida:* [Ver en Mapa](${mapsUrl})\n` +
          `• *Distancia a ti:* ${distancia.toFixed(2)} km\n` +
          `• *Duración del Servicio:* ${viaje.servicio.duracionPactadaHoras} horas\n\n` +
          `⚠️ Tienes *2 minutos* para aceptar esta oferta antes de que pase al siguiente chofer más cercano.`;
      } else {
        const empDestName = viaje.servicio.empleada.nombreArtistico;
        messageText =
          `📢 *¡Oferta de Viaje Disponible (Regreso)!* 🚗\n\n` +
          `• *Pasajera (Empleada):* ${empDestName}\n` +
          `• *Punto de Recogida (Cliente):* [Ver en Mapa](${mapsUrl})\n` +
          `• *Distancia a ti:* ${distancia.toFixed(2)} km\n\n` +
          `⚠️ Tienes *2 minutos* para aceptar esta oferta antes de que pase al siguiente chofer más cercano.`;
      }

      try {
        const sentMsg = await this.bot.telegram.sendMessage(
          driverChatId,
          messageText,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  '🚗 Aceptar Viaje',
                  `c_ac_v:${viaje.id}:${driverChatId}`,
                ),
                Markup.button.callback(
                  '❌ Rechazar Oferta',
                  `r_v_o:${viaje.id}`,
                ),
              ],
            ]),
          },
        );
        viaje.telegramChoferMsgOfertaId = sentMsg.message_id.toString();
        await this.viajesRepository.save(viaje);
      } catch (err) {
        console.error(
          `[dispatchViaje] Error enviando mensaje a Telegram de chofer ${nearestDriver.id}:`,
          err,
        );
        await this.rechazarOfertaManual(viaje.id, nearestDriver.id);
        return;
      }
    }

    // Configurar Timeout de 2 minutos (120000 ms) para expirar la oferta si no responde
    const timeout = setTimeout(() => {
      void (async () => {
        try {
          const checkViaje = await this.viajesRepository.findOne({
            where: { id: viajeId },
          });
          if (
            checkViaje &&
            checkViaje.estado === 'notificado' &&
            checkViaje.choferId === nearestDriver.id
          ) {
            console.log(
              `[dispatchViaje] Oferta expirada por timeout para viaje ${viajeId}, chofer ${nearestDriver.id}`,
            );
            await this.expirarOfertaYContinuar(viajeId, nearestDriver.id);
          }
        } catch (timeoutErr) {
          console.error(
            `[dispatchViaje] Error en timeout de viaje ${viajeId}:`,
            timeoutErr,
          );
        }
      })();
    }, 120000);
    this.dispatchTimeouts.set(viajeId, timeout);
    console.log(`[dispatchViaje] Timeout establecido para viaje ${viajeId}`);
  }

  private async notifyNoDriversAvailable(viaje: Viajes): Promise<void> {
    const event = {
      type: 'no_drivers_available',
      data: {
        serviceId: viaje.servicioId,
        tripId: viaje.id,
        tripType: viaje.tipo,
      },
    };
    this.realtimeEventsService.emitToBoss(viaje.servicio.jefeId, event);

    const topic = this.getServiceTopic(viaje.servicio);
    if (!topic) return;
    await this.bot.telegram
      .sendMessage(
        topic.chatId,
        `⚠️ No se encontraron choferes disponibles para el viaje de ${viaje.tipo}. Puedes cambiar el método de transporte a Uber.`,
        {
          message_thread_id: topic.threadId,
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                '📱 Cambiar a Uber',
                `cambiar_transporte:${viaje.id}:uber`,
              ),
            ],
          ]),
        },
      )
      .catch((error) =>
        console.error(
          `[dispatchViaje] No se pudo notificar al jefe del viaje ${viaje.id}:`,
          error,
        ),
      );
  }

  async expirarOfertaYContinuar(
    viajeId: string,
    choferId: string,
  ): Promise<void> {
    this.clearDispatchTimeout(viajeId);

    const viaje = await this.viajesRepository.findOne({
      where: { id: viajeId },
      relations: { chofer: { usuario: true } },
    });

    if (viaje && viaje.estado === 'notificado' && viaje.choferId === choferId) {
      const driverChatId = viaje.chofer?.usuario?.telegramChatId;
      if (driverChatId && viaje.telegramChoferMsgOfertaId) {
        try {
          await this.bot.telegram.editMessageText(
            driverChatId,
            parseInt(viaje.telegramChoferMsgOfertaId, 10),
            undefined,
            `⏰ *Oferta expirada.*\nNo respondiste a tiempo y el viaje ha sido ofrecido al siguiente chofer disponible.`,
          );
        } catch (editErr) {
          console.error(`Error al editar mensaje de oferta expirada:`, editErr);
        }
      }

      viaje.choferId = null;
      viaje.telegramChoferMsgOfertaId = null;
      await this.viajesRepository.save(viaje);

      await this.dispatchViaje(viajeId);
    }
  }

  async rechazarOfertaManual(viajeId: string, choferId: string): Promise<void> {
    this.clearDispatchTimeout(viajeId);

    const viaje = await this.viajesRepository.findOne({
      where: { id: viajeId },
      relations: { chofer: { usuario: true } },
    });

    if (viaje && viaje.estado === 'notificado' && viaje.choferId === choferId) {
      const driverChatId = viaje.chofer?.usuario?.telegramChatId;
      if (driverChatId && viaje.telegramChoferMsgOfertaId) {
        try {
          await this.bot.telegram.editMessageText(
            driverChatId,
            parseInt(viaje.telegramChoferMsgOfertaId, 10),
            undefined,
            `❌ *Has rechazado esta oferta de viaje.*`,
          );
        } catch (editErr) {
          console.error(
            `Error al editar mensaje de oferta rechazada:`,
            editErr,
          );
        }
      }

      viaje.choferId = null;
      viaje.telegramChoferMsgOfertaId = null;
      await this.viajesRepository.save(viaje);

      await this.dispatchViaje(viajeId);
    }
  }

  startWaitTimeout(servicioId: string, durationMs: number = 600000) {
    this.clearWaitTimeout(servicioId);

    const timeout = setTimeout(() => {
      void this.handleWaitTimeoutExpired(servicioId).catch((err) => {
        console.error(
          `Error handling wait timeout for service ${servicioId}:`,
          err,
        );
      });
    }, durationMs);

    this.waitTimeouts.set(servicioId, timeout);
  }

  clearWaitTimeout(servicioId: string) {
    const existing = this.waitTimeouts.get(servicioId);
    if (existing) {
      clearTimeout(existing);
      this.waitTimeouts.delete(servicioId);
    }
  }

  async handleWaitTimeoutExpired(servicioId: string): Promise<void> {
    this.waitTimeouts.delete(servicioId);

    const servicio = await this.serviciosRepository.findOne({
      where: { id: servicioId },
      relations: {
        empleada: { usuario: true },
        cliente: true,
        viajes: true,
      },
    });

    if (!servicio || servicio.estado !== 'en_curso') {
      return;
    }

    const viajeIda = servicio.viajes.find((v) => v.tipo === 'ida');
    if (
      !viajeIda ||
      viajeIda.estado === 'en_curso' ||
      viajeIda.estado === 'finalizado'
    ) {
      return;
    }

    console.log(
      `[handleWaitTimeoutExpired] Expiró tiempo de espera para servicio ${servicioId}. Prórrogas usadas: ${servicio.prorrogasUsadas}`,
    );

    await this.cancelarServicioPorDemora(servicioId);
  }

  async cancelarServicioPorDemora(servicioId: string): Promise<void> {
    const servicio = await this.serviciosRepository.findOne({
      where: { id: servicioId },
      relations: {
        empleada: { usuario: true },
        cliente: true,
        viajes: true,
      },
    });

    if (!servicio || servicio.estado !== 'en_curso') return;

    servicio.estado = 'cancelado';
    await this.serviciosRepository.save(servicio);

    const viajeIda = servicio.viajes.find((v) => v.tipo === 'ida');
    if (viajeIda) {
      viajeIda.estado = 'cancelado';
      await this.viajesRepository.save(viajeIda);

      if (viajeIda.choferId) {
        const chofer = await this.choferesRepository.findOne({
          where: { id: viajeIda.choferId },
          relations: { usuario: true },
        });
        if (chofer && chofer.usuario?.telegramChatId) {
          try {
            await this.bot.telegram.sendMessage(
              chofer.usuario.telegramChatId,
              `❌ *Servicio Cancelado:*\nEl viaje ha sido cancelado automáticamente debido a la demora de la empleada. Estás libre para tomar otros viajes.`,
              { parse_mode: 'Markdown' },
            );
          } catch (err) {
            console.error('Error al notificar al chofer de cancelación:', err);
          }
        }
      }
    }

    await this.serviciosRepository.manager
      .getRepository(Empleadas)
      .update(servicio.empleadaId, { disponible: true });

    const empUser = servicio.empleada?.usuario;
    if (empUser) {
      const targetChatId = empUser.telegramChatId;
      const threadId = undefined;

      if (targetChatId) {
        try {
          await this.bot.telegram.sendMessage(
            targetChatId,
            `❌ *Servicio Cancelado por Tardanza:*\nSe agotó el tiempo de espera límite y no abordaste el vehículo. El servicio con el cliente ha sido cancelado.`,
            { message_thread_id: threadId, parse_mode: 'Markdown' },
          );
        } catch (err) {
          console.error('Error al notificar a empleada de cancelación:', err);
        }
      }
    }

    if (servicio.cliente?.telegramChatId) {
      try {
        await this.bot.telegram.sendMessage(
          servicio.cliente.telegramChatId,
          `❌ *Servicio Cancelado:*\nLamentamos informarte que la empleada *${servicio.empleada.nombreArtistico}* no pudo estar disponible a tiempo y el servicio ha sido cancelado.\n\n` +
            `Te recomendamos ver otras opciones de empleadas disponibles ahora mismo:`,
          { parse_mode: 'Markdown' },
        );

        const disponibles = await this.serviciosRepository.manager
          .getRepository(Empleadas)
          .find({
            where: { disponible: true, catalogoActivo: true },
            take: 3,
          });

        if (disponibles.length > 0) {
          for (const emp of disponibles) {
            await this.bot.telegram.sendMessage(
              servicio.cliente.telegramChatId,
              `👩‍🍳 *${emp.nombreArtistico}*\n` +
                `• Tarifa: $${emp.precioBaseHora}/hr\n` +
                `• Descripción: ${emp.descripcion || 'Sin descripción'}`,
              {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                  [
                    Markup.button.callback(
                      '🤝 Contratar a ella',
                      `contratar_empleada:${emp.id}`,
                    ),
                  ],
                ]),
              },
            );
          }
        } else {
          await this.bot.telegram.sendMessage(
            servicio.cliente.telegramChatId,
            `Lo sentimos, no hay otras empleadas disponibles en este momento. Por favor, intenta de nuevo más tarde.`,
          );
        }
      } catch (err) {
        console.error('Error al notificar al cliente de cancelación:', err);
      }
    }
  }

  async requestReturnTransport(servicioId: string): Promise<void> {
    const servicio = await this.serviciosRepository.findOne({
      where: { id: servicioId },
      relations: { jefe: true, empleada: true },
    });
    if (!servicio) throw new NotFoundException('Servicio no encontrado');

    const nextReminder = new Date(Date.now() + 5 * 60_000);
    await this.serviciosRepository.update(servicio.id, {
      estadoLiquidacion: 'transporte_pendiente',
      recordatoriosRegreso: 0,
      proximoRecordatorioRegresoAt: nextReminder,
    });
    await this.liquidationSync.syncOfficeRecord(servicio.id);
    await this.sendReturnTransportPrompt(servicio, false);
  }

  private async sendReturnTransportPrompt(
    servicio: Servicios,
    reminder: boolean,
  ): Promise<void> {
    const topic = this.getServiceTopic(servicio);
    if (!topic) return;
    await this.bot.telegram.sendMessage(
      topic.chatId,
      `${reminder ? '⏰ *Recordatorio*\n\n' : ''}La empleada *${servicio.empleada?.nombreArtistico || ''}* finalizó el servicio. ¿Cómo será su viaje de regreso?`,
      {
        message_thread_id: topic.threadId,
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              '🚗 Regreso con chofer',
              `regreso_transporte:${servicio.id}:interno`,
            ),
            Markup.button.callback(
              '📱 Regreso con Uber',
              `regreso_transporte:${servicio.id}:uber`,
            ),
          ],
        ]),
      },
    );
  }

  async processReturnTransportReminders(): Promise<void> {
    const pending = await this.serviciosRepository.find({
      where: {
        estadoLiquidacion: 'transporte_pendiente',
        proximoRecordatorioRegresoAt: LessThanOrEqual(new Date()),
      },
      relations: { jefe: true, empleada: true },
    });

    for (const servicio of pending) {
      const count = servicio.recordatoriosRegreso + 1;
      await this.sendReturnTransportPrompt(servicio, true).catch((error) =>
        console.error('Error sending return reminder:', error),
      );
      await this.serviciosRepository.update(servicio.id, {
        recordatoriosRegreso: count,
        proximoRecordatorioRegresoAt:
          count < 3 ? new Date(Date.now() + 5 * 60_000) : null,
      });
      if (count === 3) {
        const admins = await this.usuariosRepository.find({
          where: [
            { rol: 'admin', activo: true },
            { rol: 'jefe', activo: true },
          ],
        });
        await Promise.allSettled(
          admins
            .filter((user) => user.telegramChatId)
            .map((user) =>
              this.bot.telegram.sendMessage(
                user.telegramChatId!,
                `🚨 El servicio ${servicio.id} sigue sin transporte de regreso después de tres recordatorios.`,
              ),
            ),
        );
        this.realtimeEventsService.emitToBoss(servicio.jefeId, {
          type: 'return_transport_escalated',
          data: { serviceId: servicio.id },
        });
      }
    }
  }

  async chooseReturnTransport(
    servicioId: string,
    actorId: string,
    provider: 'interno' | 'uber',
  ): Promise<{ trip: Viajes; uberLink?: string }> {
    const result = await this.serviciosRepository.manager.transaction(
      async (manager) => {
        const servicio = await manager.findOne(Servicios, {
          where: { id: servicioId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!servicio) throw new NotFoundException('Servicio no encontrado');
        const actor = await manager.findOneBy(Usuarios, { id: actorId });
        if (
          !actor ||
          (actor.rol !== 'admin' &&
            (actor.rol !== 'jefe' || servicio.jefeId !== actor.id))
        ) {
          throw new ConflictException('No puedes decidir este regreso');
        }
        if (servicio.estadoLiquidacion !== 'transporte_pendiente') {
          throw new ConflictException(
            'El transporte de regreso ya fue elegido',
          );
        }
        const existing = await manager.findOneBy(Viajes, {
          servicioId,
          tipo: 'regreso',
        });
        if (existing)
          throw new ConflictException('El viaje de regreso ya existe');

        const trip = await manager.save(
          Viajes,
          manager.create(Viajes, {
            servicioId,
            choferId: null,
            tipo: 'regreso',
            zona: 'domicilio',
            tarifa: provider === 'uber' ? 0 : this.driverPayoutFor(servicio),
            driverPayout:
              provider === 'uber' ? 0 : this.driverPayoutFor(servicio),
            estado: provider === 'uber' ? 'aceptado' : 'notificado',
            proveedorTransporte: provider,
          }),
        );
        servicio.proximoRecordatorioRegresoAt = null;
        await manager.save(Servicios, servicio);

        // Keep the row lock query free of outer joins. PostgreSQL cannot apply
        // FOR UPDATE to the nullable side generated by TypeORM relation joins.
        if (provider === 'uber') {
          const empleada = await manager.findOneBy(Empleadas, {
            id: servicio.empleadaId,
          });
          if (empleada) servicio.empleada = empleada;
        }
        return { trip, servicio };
      },
    );
    await this.liquidationSync.syncOfficeRecord(result.servicio.id);

    if (provider === 'interno') {
      await this.dispatchViaje(result.trip.id);
      await this.sendFinalReceiptAndAward(result.servicio.id);
      this.realtimeEventsService.emitToBoss(result.servicio.jefeId, {
        type: 'return_transport_selected',
        data: { serviceId: result.servicio.id, trip: result.trip },
      });
      return { trip: result.trip };
    }
    this.realtimeEventsService.emitToBoss(result.servicio.jefeId, {
      type: 'return_transport_selected',
      data: { serviceId: result.servicio.id, trip: result.trip },
    });
    const employee = await this.serviciosRepository.findOne({
      where: { id: result.servicio.id },
      relations: { empleada: { usuario: true } },
    });
    const employeeChatId = employee?.empleada?.usuario?.telegramChatId;
    if (employeeChatId && employee) {
      await this.bot.telegram.sendMessage(
        employeeChatId,
        'Solicita tu viaje de regreso y confirma cada etapa.',
        {
          ...Markup.inlineKeyboard([
            [
              Markup.button.url(
                'Abrir Uber',
                this.buildUberLinkForTrip(employee, 'regreso'),
              ),
            ],
            [
              Markup.button.callback(
                'Ya estoy en el Uber',
                `eu:${result.trip.id}:i`,
              ),
              Markup.button.callback('Ya llegué', `eu:${result.trip.id}:f`),
            ],
          ]),
        },
      );
    }
    return { trip: result.trip };
  }

  private buildUberLink(servicio: Servicios): string {
    let link = `https://m.uber.com/ul/?action=setPickup`;
    const employee = servicio.empleada;
    link += `&dropoff[latitude]=${employee?.ubicacionLat}&dropoff[longitude]=${employee?.ubicacionLng}&dropoff[nickname]=Casa`;
    link += `&pickup[latitude]=${servicio.ubicacionClienteLat}&pickup[longitude]=${servicio.ubicacionClienteLng}&pickup[nickname]=Recoger%20Empleada`;
    return link;
  }

  async changeTripTransport(
    tripId: string,
    actorId: string,
    provider: 'interno' | 'uber',
  ): Promise<{ trip: Viajes; uberLink?: string }> {
    const result = await this.serviciosRepository.manager.transaction(
      async (manager) => {
        const trip = await manager.findOne(Viajes, {
          where: { id: tripId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!trip) throw new NotFoundException('Viaje no encontrado');

        const [servicio, actor] = await Promise.all([
          manager.findOneBy(Servicios, { id: trip.servicioId }),
          manager.findOneBy(Usuarios, { id: actorId }),
        ]);
        if (!servicio) throw new NotFoundException('Servicio no encontrado');
        if (
          !actor ||
          (actor.rol !== 'admin' &&
            (actor.rol !== 'jefe' || servicio.jefeId !== actor.id))
        ) {
          throw new ConflictException('No puedes modificar este viaje');
        }
        if (!['notificado', 'aceptado', 'llegado'].includes(trip.estado)) {
          throw new ConflictException(
            'El transporte no puede cambiarse cuando el viaje está en curso o finalizado',
          );
        }
        if (trip.choferId) {
          throw new ConflictException(
            'El transporte no puede cambiarse porque el viaje ya tiene un chofer asignado',
          );
        }
        if (trip.proveedorTransporte === provider) {
          throw new ConflictException(
            `El viaje ya usa ${provider === 'uber' ? 'Uber' : 'chofer'}`,
          );
        }

        trip.proveedorTransporte = provider;
        trip.choferId = null;
        trip.choferesNotificados = [];
        trip.telegramChoferMsgOfertaId = null;
        trip.telegramUberFileId = null;
        trip.horaNotificacion = new Date();
        trip.horaAceptacion = provider === 'uber' ? new Date() : null;
        trip.horaInicioViaje = null;
        trip.horaFinViaje = null;
        trip.estado = provider === 'uber' ? 'aceptado' : 'notificado';
        trip.tarifa = provider === 'uber' ? 0 : this.driverPayoutFor(servicio);
        trip.driverPayout =
          provider === 'uber' ? 0 : this.driverPayoutFor(servicio);
        await manager.save(Viajes, trip);

        if (trip.tipo === 'regreso') {
          servicio.estadoLiquidacion = 'transporte_pendiente';
          await manager.save(Servicios, servicio);
        }

        return { trip, servicio };
      },
    );

    this.clearDispatchTimeout(tripId);

    const servicio = await this.serviciosRepository.findOne({
      where: { id: result.servicio.id },
      relations: { empleada: { usuario: true }, jefe: true },
    });
    if (!servicio) throw new NotFoundException('Servicio no encontrado');
    await this.liquidationSync.syncOfficeRecord(servicio.id);

    let uberLink: string | undefined;
    if (provider === 'interno') {
      await this.dispatchViaje(result.trip.id);
      if (result.trip.tipo === 'regreso') {
        await this.sendFinalReceiptAndAward(servicio.id);
      }
    } else {
      uberLink = this.buildUberLinkForTrip(servicio, result.trip.tipo);
      const employeeChatId = servicio.empleada?.usuario?.telegramChatId;
      if (employeeChatId) {
        await this.bot.telegram
          .sendMessage(
            employeeChatId,
            `El viaje de ${result.trip.tipo} cambió a Uber. Usa los botones para actualizar tu trayecto.`,
            {
              ...Markup.inlineKeyboard([
                [
                  Markup.button.url(
                    'Abrir Uber',
                    this.buildUberLinkForTrip(servicio, result.trip.tipo),
                  ),
                ],
                [
                  Markup.button.callback(
                    'Ya estoy en el Uber',
                    `eu:${result.trip.id}:i`,
                  ),
                  Markup.button.callback('Ya llegué', `eu:${result.trip.id}:f`),
                ],
              ]),
            },
          )
          .catch(() => undefined);
      }
    }

    this.realtimeEventsService.emitToBoss(servicio.jefeId, {
      type: 'trip_transport_changed',
      data: {
        serviceId: servicio.id,
        tripId: result.trip.id,
        provider,
      },
    });
    return { trip: result.trip, uberLink: undefined };
  }

  private buildUberLinkForTrip(
    servicio: Servicios,
    tripType: 'ida' | 'regreso',
  ): string {
    const ida = tripType === 'ida';
    const dropoffLat = ida
      ? servicio.ubicacionClienteLat
      : servicio.empleada?.ubicacionLat;
    const dropoffLng = ida
      ? servicio.ubicacionClienteLng
      : servicio.empleada?.ubicacionLng;
    return (
      'https://m.uber.com/ul/?action=setPickup' +
      '&pickup=my_location' +
      `&dropoff[latitude]=${dropoffLat}&dropoff[longitude]=${dropoffLng}`
    );
  }

  private driverPayoutFor(service: Servicios): number {
    return service.presetLocationId
      ? 60
      : Number(
          service.customerTransportCharge ?? service.totalTransporte ?? 0,
        ) / 2;
  }

  async saveUberScreenshot(
    tripId: string,
    actorId: string,
    fileId: string,
  ): Promise<void> {
    const trip = await this.getAuthorizedUberTrip(tripId, actorId);
    await this.viajesRepository.update(trip.id, { telegramUberFileId: fileId });
    const chatId = trip.servicio.empleada?.usuario?.telegramChatId;
    if (chatId) {
      await this.bot.telegram.sendPhoto(chatId, fileId, {
        caption: `📱 Datos del Uber de ${trip.tipo === 'ida' ? 'ida' : 'regreso'}.`,
      });
    }
  }

  async saveEmployeeUberScreenshot(
    tripId: string,
    actorId: string,
    fileId: string,
  ): Promise<Viajes> {
    const trip = await this.viajesRepository.findOne({
      where: { id: tripId },
      relations: { servicio: { cliente: true, empleada: true, jefe: true } },
    });
    if (!trip || trip.proveedorTransporte !== 'uber') {
      throw new NotFoundException('Viaje Uber no encontrado');
    }
    const actor = await this.usuariosRepository.findOneBy({ id: actorId });
    if (
      actor?.rol !== 'empleada' ||
      trip.servicio.empleada?.usuarioId !== actor.id
    ) {
      throw new ConflictException(
        'Solo la empleada asignada puede enviar la captura',
      );
    }
    if (trip.estado !== 'finalizado') {
      throw new ConflictException('Primero confirma tu llegada al destino');
    }
    await this.viajesRepository.update(trip.id, { telegramUberFileId: fileId });
    const topic = this.getServiceTopic(trip.servicio);
    if (topic) {
      await this.bot.telegram.sendPhoto(topic.chatId, fileId, {
        message_thread_id: topic.threadId,
        caption: `Resumen del Uber de ${trip.tipo}. Revisa la captura y registra el costo final.`,
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              'Introducir tarifa',
              `uber_fare_enter:${trip.id}`,
            ),
          ],
        ]),
      });
    }
    return trip;
  }

  async saveUberScreenshotFromDashboard(
    tripId: string,
    actorId: string,
    file: any,
  ): Promise<{ fileId: string }> {
    const trip = await this.getAuthorizedUberTrip(tripId, actorId);
    const chatId = trip.servicio.empleada?.usuario?.telegramChatId;
    if (!chatId) {
      throw new ConflictException(
        'La empleada no tiene una cuenta de Telegram vinculada',
      );
    }

    const message = await this.bot.telegram.sendPhoto(
      chatId,
      { source: file.buffer, filename: file.originalname },
      {
        caption: `Datos del Uber de ${trip.tipo === 'ida' ? 'ida' : 'regreso'}.`,
      },
    );
    const photos = message.photo;
    const fileId = photos[photos.length - 1]?.file_id;
    if (!fileId) {
      throw new ConflictException('Telegram no devolvió la captura enviada');
    }
    await this.viajesRepository.update(trip.id, {
      telegramUberFileId: fileId,
    });
    return { fileId };
  }

  async confirmUberFare(
    tripId: string,
    actorId: string,
    amount: number,
  ): Promise<void> {
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      Math.round(amount * 100) !== amount * 100
    ) {
      throw new BadRequestException(
        'El costo debe ser positivo y tener máximo dos decimales',
      );
    }
    const trip = await this.getAuthorizedUberTrip(tripId, actorId);
    if (trip.estado === 'cancelado') {
      throw new ConflictException(
        'La tarifa no puede registrarse en un viaje cancelado',
      );
    }
    const actor = await this.usuariosRepository.findOneBy({ id: actorId });
    if (!actor) throw new ConflictException('Usuario no autorizado');
    const settledCashObligation = this.serviciosRepository.manager
      ?.getRepository
      ? await this.serviciosRepository.manager
          .getRepository(EmployeeCashObligation)
          .findOneBy({ serviceId: trip.servicioId, status: 'paid' })
      : null;
    if (
      settledCashObligation &&
      trip.fareConfirmedAt &&
      Number(trip.tarifa) !== amount
    ) {
      throw new ConflictException(
        'La entrega de efectivo ya fue saldada; la corrección requiere un ajuste administrativo independiente',
      );
    }
    const override = !trip.telegramUberFileId && actor.rol === 'admin';
    if (!trip.telegramUberFileId && !override) {
      throw new ConflictException(
        'La empleada debe enviar la captura antes de confirmar el costo',
      );
    }
    await this.viajesRepository.update(trip.id, {
      tarifa: amount,
      fareConfirmedAt: new Date(),
      fareConfirmedByUserId: actorId,
      fareConfirmationOverride: override,
    });
    await this.liquidationSync.syncOfficeRecord(trip.servicioId);
    if (trip.tipo === 'regreso') {
      await this.sendFinalReceiptAndAward(trip.servicioId);
      if (trip.estado === 'finalizado') {
        setTimeout(() => {
          this.deleteServiceTopic(trip.servicio).catch((error) =>
            console.error(
              `[ServicesService] No se pudo cerrar el tema del servicio ${trip.servicioId}:`,
              error,
            ),
          );
        }, 1500);
      }
    }
    const updated = await this.serviciosRepository.findOneBy({
      id: trip.servicioId,
    });
    this.realtimeEventsService.emitToBoss(trip.servicio.jefeId, {
      type: 'service_total_updated',
      data: {
        serviceId: trip.servicioId,
        tripId: trip.id,
        fare: amount,
        totalTransporte: updated?.totalTransporte,
        totalFinal: updated?.totalFinal,
      },
    });
  }

  private async getAuthorizedUberTrip(
    tripId: string,
    actorId: string,
  ): Promise<Viajes> {
    const trip = await this.viajesRepository.findOne({
      where: { id: tripId },
      relations: { servicio: { jefe: true, empleada: { usuario: true } } },
    });
    if (!trip || trip.proveedorTransporte !== 'uber') {
      throw new NotFoundException('Viaje Uber no encontrado');
    }
    const actor = await this.usuariosRepository.findOneBy({ id: actorId });
    if (
      !actor ||
      (actor.rol !== 'admin' && trip.servicio.jefeId !== actor.id)
    ) {
      throw new ConflictException('No puedes modificar este viaje');
    }
    return trip;
  }

  async sendFinalReceiptAndAward(servicioId: string): Promise<void> {
    const servicio = await this.serviciosRepository.findOne({
      where: { id: servicioId },
      relations: { cliente: true, empleada: { usuario: true } },
    });
    if (!servicio || servicio.estado !== 'finalizado') return;
    const award =
      await this.loyaltyService.awardForFinalizedService(servicioId);
    const text =
      `✅ *Total definitivo del servicio*\n\n` +
      `• Servicio base: $${Number(servicio.totalBase).toFixed(2)}\n` +
      `• Transporte: $${Number(servicio.totalTransporte).toFixed(2)}\n` +
      `• *Total a pagar: $${Number(servicio.totalFinal).toFixed(2)}*\n` +
      `• Puntos ganados: ${award.pointsEarned}\n\n` +
      `Por favor, califica el servicio:`;
    if (servicio.cliente?.telegramChatId) {
      const keyboard = Markup.inlineKeyboard([
        ...[1, 2, 3, 4, 5].map((rating) => [
          Markup.button.callback(
            `${rating} - ${'⭐'.repeat(rating)}`,
            `calificar_servicio:${servicio.id}:${rating}`,
          ),
        ]),
        [
          Markup.button.callback(
            '⚠️ Reportar empleada',
            `er_client_start:${servicio.id}`,
          ),
        ],
      ]);
      try {
        if (servicio.telegramResumenDefinitivoId) {
          await this.bot.telegram.editMessageText(
            servicio.cliente.telegramChatId,
            Number(servicio.telegramResumenDefinitivoId),
            undefined,
            text,
            { parse_mode: 'Markdown', ...keyboard },
          );
        } else {
          const message = await this.bot.telegram.sendMessage(
            servicio.cliente.telegramChatId,
            text,
            {
              parse_mode: 'Markdown',
              ...keyboard,
            },
          );
          await this.serviciosRepository.update(servicio.id, {
            telegramResumenDefinitivoId: message.message_id.toString(),
          });
        }
      } catch {
        const message = await this.bot.telegram.sendMessage(
          servicio.cliente.telegramChatId,
          text,
          {
            parse_mode: 'Markdown',
            ...keyboard,
          },
        );
        await this.serviciosRepository.update(servicio.id, {
          telegramResumenDefinitivoId: message.message_id.toString(),
        });
      }
    }

    const employeeChatId = servicio.empleada?.usuario?.telegramChatId;
    if (employeeChatId) {
      const employeeText =
        `✅ *Monto definitivo del servicio*\n\n` +
        `• Servicio base: $${Number(servicio.totalBase).toFixed(2)}\n` +
        `• Transporte: $${Number(servicio.totalTransporte).toFixed(2)}\n` +
        `• *Total a cobrar: $${Number(servicio.totalFinal).toFixed(2)}*`;
      try {
        if (servicio.telegramEmpleadaMensajeId) {
          await this.bot.telegram.editMessageText(
            employeeChatId,
            Number(servicio.telegramEmpleadaMensajeId),
            undefined,
            employeeText,
            { parse_mode: 'Markdown' },
          );
        } else {
          const message = await this.bot.telegram.sendMessage(
            employeeChatId,
            employeeText,
            { parse_mode: 'Markdown' },
          );
          await this.serviciosRepository.update(servicio.id, {
            telegramEmpleadaMensajeId: message.message_id.toString(),
          });
        }
      } catch {
        const message = await this.bot.telegram.sendMessage(
          employeeChatId,
          employeeText,
          { parse_mode: 'Markdown' },
        );
        await this.serviciosRepository.update(servicio.id, {
          telegramEmpleadaMensajeId: message.message_id.toString(),
        });
      }
    }
    this.realtimeEventsService.emitToClient(servicio.clienteId, {
      type: 'service_total_updated',
      data: {
        serviceId: servicio.id,
        totalBase: servicio.totalBase,
        totalTransporte: servicio.totalTransporte,
        totalFinal: servicio.totalFinal,
      },
    });
  }

  async updateUberStatus(
    tripId: string,
    actorId: string,
    action:
      | 'uber_en_route'
      | 'uber_arrived'
      | 'employee_en_route'
      | 'employee_arrived',
  ): Promise<void> {
    const trip = await this.viajesRepository.findOne({
      where: { id: tripId },
      relations: {
        servicio: {
          cliente: true,
          empleada: { usuario: true, jefe: true },
          jefe: true,
        },
      },
    });
    if (!trip || trip.proveedorTransporte !== 'uber') {
      throw new NotFoundException('Viaje Uber no encontrado');
    }
    const actor = await this.usuariosRepository.findOneBy({ id: actorId });
    if (!actor) throw new ConflictException('Usuario no autorizado');
    const bossAction = action === 'uber_en_route' || action === 'uber_arrived';
    if (
      bossAction &&
      actor.rol !== 'admin' &&
      (actor.rol !== 'jefe' || actor.id !== trip.servicio.jefeId)
    ) {
      throw new ConflictException(
        'Solo el jefe asignado puede actualizar el Uber',
      );
    }
    if (
      !bossAction &&
      (actor.rol !== 'empleada' ||
        trip.servicio.empleada?.usuarioId !== actor.id)
    ) {
      throw new ConflictException(
        'Solo la empleada asignada puede actualizar el viaje',
      );
    }

    let resultingState = trip.estado;
    if (action === 'uber_en_route') {
      if (trip.estado !== 'aceptado') {
        throw new ConflictException('El Uber ya no puede marcarse en camino');
      }
      if (Number(trip.tarifa) <= 0) {
        throw new ConflictException('Primero registra la tarifa del Uber');
      }
      resultingState = 'en_camino';
      await this.viajesRepository.update(trip.id, {
        estado: resultingState,
      });
    } else if (action === 'uber_arrived') {
      if (trip.estado !== 'en_camino') {
        throw new ConflictException(
          'Primero confirma que el Uber va en camino',
        );
      }
      resultingState = 'llegado';
      await this.viajesRepository.update(trip.id, { estado: resultingState });
    } else if (action === 'employee_en_route') {
      if (trip.estado !== 'aceptado')
        throw new ConflictException('El viaje ya no puede iniciarse');
      resultingState = 'en_curso';
      await this.viajesRepository.update(trip.id, {
        estado: resultingState,
        horaInicioViaje: new Date(),
      });
    } else if (action === 'employee_arrived') {
      if (trip.estado !== 'en_curso')
        throw new ConflictException('Primero confirma que vas en camino');
      const now = new Date();
      resultingState = 'finalizado';
      await this.viajesRepository.update(trip.id, {
        estado: resultingState,
        horaFinViaje: now,
      });
      if (trip.tipo === 'regreso') {
        await this.serviciosRepository.update(trip.servicioId, {
          horaLlegadaCasa: now,
          estadoLiquidacion: 'cerrada',
        });
        await this.liquidationSync.syncOfficeRecord(trip.servicioId);
      } else if (trip.servicio.estado === 'agendado') {
        await this.serviciosRepository.update(trip.servicioId, {
          estado: 'en_curso',
          horaInicioServicio: now,
          servicioPrevioId: null,
          horaInicioEstimada: now,
        });
        this.realtimeEventsService.emitToBoss(trip.servicio.jefeId, {
          type: 'scheduled_service_started',
          data: { serviceId: trip.servicioId, tripId: trip.id },
        });
        await this.notifyScheduledServiceStarted(trip.servicioId);
      }
    }

    const employeeChatId = trip.servicio.empleada?.usuario?.telegramChatId;
    if (bossAction && employeeChatId) {
      const message =
        action === 'uber_arrived'
          ? '📍 Tu Uber ya llegó. Cuando subas, presiona “Ya estoy en el Uber”.'
          : '🚗 Tu Uber va en camino a recogerte.';
      await this.bot.telegram.sendMessage(employeeChatId, message, {
        ...Markup.inlineKeyboard(
          action === 'uber_arrived'
            ? [
                [
                  Markup.button.callback(
                    '🚗 Ya estoy en el Uber',
                    `eu:${trip.id}:i`,
                  ),
                ],
              ]
            : [],
        ),
      });
      this.realtimeEventsService.emitToEmployee(trip.servicio.empleadaId, {
        type: action,
        data: { tripId: trip.id, serviceId: trip.servicioId },
      });
    }
    if (!bossAction && trip.tipo === 'ida') {
      const event = action;
      const message =
        action === 'employee_arrived'
          ? '📍 Ya llegué al punto que cuadramos, aquí te espero 😊'
          : '🚗 Ya voy en camino, nos vemos pronto 😊';
      if (trip.servicio.cliente?.telegramChatId) {
        await this.bot.telegram.sendMessage(
          trip.servicio.cliente.telegramChatId,
          message,
        );
      }
      this.realtimeEventsService.emitToClient(trip.servicio.clienteId, {
        type: event,
        data: { tripId: trip.id, serviceId: trip.servicioId },
      });
    }
    if (action === 'employee_arrived' && trip.tipo === 'regreso') {
      if (trip.servicio.cliente?.telegramChatId) {
        await this.bot.telegram
          .sendMessage(
            trip.servicio.cliente.telegramChatId,
            'El servicio quedó completado: la empleada llegó a su destino.',
          )
          .catch(() => undefined);
      }
      this.realtimeEventsService.emitToClient(trip.servicio.clienteId, {
        type: 'service_fully_completed',
        data: { serviceId: trip.servicioId, tripId: trip.id },
      });
    }
    if (!bossAction) {
      const topic = this.getServiceTopic(trip.servicio);
      if (topic) {
        const employeeName =
          trip.servicio.empleada?.nombreArtistico || 'La empleada';
        const message =
          action === 'employee_arrived'
            ? `La empleada ${employeeName} confirmó que llegó al destino del viaje de ${trip.tipo}.`
            : `La empleada ${employeeName} confirmó que ya está dentro del Uber de ${trip.tipo}.`;
        try {
          await this.bot.telegram.sendMessage(topic.chatId, message, {
            message_thread_id: topic.threadId,
          });
        } catch (error) {
          console.error(
            `[ServicesService] No se pudo notificar el estado del viaje en el tema ${topic.threadId}:`,
            error,
          );
        }
      }
    }
    this.realtimeEventsService.emitToBoss(trip.servicio.jefeId, {
      type: 'trip_status_updated',
      data: {
        serviceId: trip.servicioId,
        tripId: trip.id,
        action,
        state: resultingState,
        tripType: trip.tipo,
      },
    });
  }
}
