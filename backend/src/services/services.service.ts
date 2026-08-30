import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Inject,
  forwardRef,
  OnModuleInit,
  OnModuleDestroy,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  EntityManager,
  In,
  IsNull,
  LessThanOrEqual,
  Not,
  Repository,
  SelectQueryBuilder,
} from 'typeorm';
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
import { AuthorizedBankAccounts } from './entities/authorized-bank-account.entity';
import { SaveBankAccountDto } from './dto/bank-account.dto';
import { CancelServiceDto } from './dto/cancel-service.dto';
import { UploadService } from '../upload/upload.service';
import { parseSessionKey } from '../telegram/telegram-session.key';
import { PaymentReceiptValidations } from './entities/payment-receipt-validation.entity';
import { describeError } from '../common/errors/error-message';
import { Clientes } from '../clients/entities/client.entity';
import { ExtrasCatalogo } from '../catalog-extras/entities/catalog-extra.entity';
import { ExtrasServicio } from '../service-extras/entities/service-extra.entity';
import { ServiceParticipant } from '../group-services/entities/service-participant.entity';
import { TelegramSession } from '../telegram/entities/telegram-session.entity';
import { formatServiceDuration, roundOpenEndedHours } from './service-duration';
import { APP_TIME_ZONE, APP_LOCALE } from '../common/locale';

/**
 * Si una persona del equipo puede hacerse cargo de algo ahora.
 *
 * Son dos preguntas distintas y las dos tienen que cumplirse: `disponible` dice
 * que no esta ocupada en este momento, `enJornada` que sigue trabajando hoy.
 * Mirar solo la primera hacia que a alguien que ya cerro su dia le siguieran
 * cayendo servicios.
 */
export function puedeAtender(persona: {
  disponible?: boolean | null;
  enJornada?: boolean | null;
}): boolean {
  return persona.disponible !== false && persona.enJornada !== false;
}

/**
 * Estados en los que un viaje ya salio a la calle. Si se cancela estando aqui,
 * lo mas probable es que haya costado dinero.
 */
const DISPATCHED_TRIP_STATES = ['aceptado', 'en_camino', 'llegado', 'en_curso'];

/**
 * Tope por defecto del listado de servicios. Generoso para que los paneles
 * existentes sigan funcionando sin cambios, pero acotado: sin limite, la
 * consulta crecia sin freno con el historico.
 */
/** Cuanto vive una oferta de viaje enviada a un chofer. */
const DISPATCH_OFFER_TTL_MS = 120_000;

/**
 * Ofertas rechazadas seguidas antes de multar, y el monto.
 *
 * Tres es el limite que pidio la operacion: una o dos son circunstanciales
 * (esta comiendo, le queda lejos), tres seguidas ya es un patron.
 */
const DRIVER_REJECTION_LIMIT = 3;
const DRIVER_REJECTION_FINE = 100;

const SERVICES_DEFAULT_PAGE_SIZE = 200;
const SERVICES_MAX_PAGE_SIZE = 500;

export type EvidenceItem = {
  id: string;
  kind: 'uber' | 'transferencia';
  url: string;
  status: string;
  createdAt: string;
  serviceId: string | null;
  tripId?: string;
  tripType?: 'ida' | 'regreso';
  clientName?: string | null;
  amount?: number | null;
  observations?: string | null;
};

/**
 * Lo que devuelve el cierre de un servicio por la empleada.
 *
 * Lleva ya resuelto lo que cada canal necesita para redactar su resumen --la
 * duracion en texto y las horas cobradas de un servicio abierto-- para que ni
 * el chat ni el portal tengan que volver a calcularlo por su cuenta y acaben
 * discrepando.
 */
export interface FinishByEmployeeResult {
  servicio: Servicios;
  clienteNombre: string | null;
  clienteChatId: string | null;
  duracionFormatted: string;
  /** Horas cobradas si la duracion era abierta; null si estaba pactada. */
  horasFacturadas: number | null;
  /** Enlaza con otro servicio ya agendado: no hay regreso que cuadrar. */
  hasSuccessor: boolean;
}

/** Lo que devuelve agregar un extra: el servicio ya recalculado y su desglose. */
export interface AddServiceExtraResult {
  servicio: Servicios;
  extraAgregado: ExtrasCatalogo;
  precioCobrado: number;
  extras: Array<{
    id: string;
    nombre: string;
    precioCobrado: number;
    metodoPago: string;
  }>;
  totalExtras: number;
}

@Injectable()
export class ServicesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ServicesService.name);
  private waitTimeouts = new Map<string, NodeJS.Timeout>();
  private dispatchTimeouts = new Map<string, NodeJS.Timeout>();
  private maintenanceInterval?: NodeJS.Timeout;

  clearDispatchTimeout(viajeId: string) {
    const existing = this.dispatchTimeouts.get(viajeId);
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
    @InjectRepository(AuthorizedBankAccounts)
    private readonly bankAccountsRepository: Repository<AuthorizedBankAccounts>,
    @InjectRepository(PaymentReceiptValidations)
    private readonly paymentReceiptValidationsRepository: Repository<PaymentReceiptValidations>,
    private readonly realtimeEventsService: RealtimeEventsService,
    @InjectBot() private readonly bot: Telegraf<Context>,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegramService: TelegramService,
    private readonly aiMessageService: AiMessageService,
    private readonly loyaltyService: LoyaltyService,
    private readonly liquidationSync: OfficeLiquidationSyncService,
    private readonly configService: ConfigService,
    private readonly disciplineService: DisciplineService,
    private readonly uploadService: UploadService,
    /*
     * Los tres ultimos entran para el cierre de un servicio por la empleada:
     * liberarla del catalogo, avisar a quien la estaba esperando y dejar el
     * registro de la cuenta final. Van al final del constructor a proposito,
     * para no correr las posiciones de los que ya estaban.
     */
    @InjectRepository(Empleadas)
    private readonly empleadasRepository: Repository<Empleadas>,
    @InjectRepository(Clientes)
    private readonly clientesRepository: Repository<Clientes>,
    @InjectRepository(TelegramSession)
    private readonly telegramSessionRepository: Repository<TelegramSession>,
    // Los extras de un servicio en curso: el catalogo de la modelo, lo ya
    // cobrado y, en un grupal, a que participante se le imputa.
    @InjectRepository(ExtrasCatalogo)
    private readonly extrasCatalogoRepository: Repository<ExtrasCatalogo>,
    @InjectRepository(ExtrasServicio)
    private readonly extrasServicioRepository: Repository<ExtrasServicio>,
    @InjectRepository(ServiceParticipant)
    private readonly serviceParticipantsRepository: Repository<ServiceParticipant>,
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
    // Un servicio registrado a mano puede no tener cliente identificado, y sin
    // el no hay hilo de conversacion al que pertenezca el mensaje.
    if (!service.clienteId) return;
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
    // Se rellena dentro de la transaccion y se usa despues: avisar al jefe no
    // puede ocurrir con la fila de la empleada bloqueada.
    let competing: Array<{ id: string }> = [];

    const reserved = await this.serviciosRepository.manager.transaction(
      async (manager) => {
        await manager
          .getRepository(Empleadas)
          .createQueryBuilder('employee')
          .setLock('pessimistic_write')
          .where('employee.id = :id', { id: createData.empleadaId })
          .getOneOrFail();

        if (
          createData.tipoAgenda === 'programado' ||
          createData.fechaProgramada
        ) {
          const scheduledDate = new Date(createData.fechaProgramada!);
          const durationHours = Number(createData.duracionPactadaHoras) || 1;
          const scheduledEnd = new Date(
            scheduledDate.getTime() + (durationHours * 60 + 45) * 60_000,
          );
          const scheduledStartWithBuffer = new Date(
            scheduledDate.getTime() - 45 * 60_000,
          );

          const existingServices = await manager.find(Servicios, {
            where: {
              empleadaId: createData.empleadaId,
              estado: In(['pendiente', 'agendado', 'en_curso']),
            },
          });

          for (const existing of existingServices) {
            const start =
              existing.fechaProgramada ||
              existing.horaInicioEstimada ||
              existing.horaInicioServicio ||
              existing.createdAt;
            if (!start) continue;
            const startDate = new Date(start);
            const end = new Date(
              startDate.getTime() +
                (Number(existing.duracionPactadaHoras) * 60 + 45) * 60_000,
            );
            const startWithBuffer = new Date(startDate.getTime() - 45 * 60_000);

            if (
              scheduledDate.getTime() < end.getTime() &&
              scheduledEnd.getTime() > startWithBuffer.getTime()
            ) {
              throw new ConflictException(
                'La empleada ya tiene un compromiso agendado en ese horario',
              );
            }
          }

          const draft = manager.create(Servicios, {
            ...createData,
            tipoAgenda: 'programado',
            fechaProgramada: scheduledDate,
            horaInicioEstimada: scheduledDate,
          });
          return manager.save(Servicios, draft);
        }

        const active = await manager.findOne(Servicios, {
          where: { empleadaId: createData.empleadaId, estado: 'en_curso' },
          order: { createdAt: 'DESC' },
        });
        if (!active) {
          // Dos clientes pueden pedir a la vez a la misma empleada libre y los
          // dos servicios se crean: es el jefe quien decide cual acepta. Lo que
          // no puede pasar es que se entere por casualidad, asi que se cuentan
          // aqui, dentro del bloqueo, y se avisa al salir.
          competing = await manager.find(Servicios, {
            where: {
              empleadaId: createData.empleadaId,
              estado: 'pendiente',
            },
            select: { id: true },
          });
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
      },
    );

    if (competing.length > 0) {
      this.warnAboutCompetingRequests(reserved, competing.length + 1);
    }
    return reserved;
  }

  /**
   * Avisa al jefe de que varios clientes estan esperando a la misma empleada.
   *
   * No bloquea ninguna de las solicitudes —se decidio que sea el jefe quien
   * elija— pero sin este aviso las dos aparecen como peticiones normales y
   * nada indica que compiten por la misma persona.
   */
  private warnAboutCompetingRequests(servicio: Servicios, total: number): void {
    try {
      this.realtimeEventsService.emitToBoss(servicio.jefeId, {
        type: 'service_requests_competing',
        data: {
          empleadaId: servicio.empleadaId,
          servicioId: servicio.id,
          pendientes: total,
        },
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo avisar de solicitudes en competencia para la empleada ${servicio.empleadaId}: ${describeError(error)}`,
      );
    }
  }

  /**
   * Mueve un servicio de un estado a otro, y solo si sigue en el de partida.
   *
   * Es la unica forma segura de resolver un boton que se pulsa dos veces. La
   * comprobacion `if (servicio.estado !== 'pendiente')` que hay antes de cada
   * accion se hace sobre una fila leida hace un instante: dos pulsaciones
   * --del mismo jefe impaciente o de dos jefes a la vez-- la superan las dos y
   * el servicio se acepta por duplicado, con dos viajes y dos avisos.
   *
   * Aqui la condicion viaja dentro del propio UPDATE, asi que Postgres decide:
   * la primera actualiza una fila, la segunda ninguna. Devuelve si esta llamada
   * fue la que gano.
   */
  private async transicionarEstado(
    servicioId: string,
    desde: Servicios['estado'],
    hasta: Servicios['estado'],
    camposExtra: Partial<Servicios> = {},
    manager: EntityManager = this.serviciosRepository.manager,
  ): Promise<boolean> {
    const resultado = await manager
      .createQueryBuilder()
      .update(Servicios)
      .set({ estado: hasta, ...camposExtra })
      .where('id = :servicioId AND estado = :desde', { servicioId, desde })
      .execute();
    return (resultado.affected ?? 0) > 0;
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
      this.logger.error(
        `[ServicesService] No se pudo eliminar el tema ${topic.threadId} del servicio ${servicio.id}:`,
        error,
      );
    }
  }

  async create(createServiceDto: any): Promise<Servicios> {
    /*
     * Un servicio creado desde el panel no viene de una conversacion con la
     * IA. Sin esto quedaba con el valor por defecto de la columna (activa), y
     * el puente que reenvia mensajes del cliente al tema del jefe exige que
     * este apagada: cualquier mensaje que el cliente mandara despues caia en
     * un pozo sin que nadie se enterara.
     */
    if (createServiceDto.iaActiva === undefined) {
      createServiceDto.iaActiva = false;
    }
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
            /*
             * El relevo al jefe secundario ya existia para `disponible`; la
             * jornada cerrada cuenta igual, y con mas motivo: quien termino su
             * dia no va a atender el servicio en un rato.
             */
            if (!mainJefe || !puedeAtender(mainJefe)) {
              if (emp.jefeSecundarioId) {
                const secJefe = await this.usuariosRepository.findOne({
                  where: { id: emp.jefeSecundarioId, activo: true },
                });
                if (secJefe && puedeAtender(secJefe)) {
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
        this.logger.error('Error auto-assigning jefeId for employee:', err);
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
      this.logger.error('Error emitting SSE event for new service:', sseErr);
    }

    // Send Telegram notification to Jefes & Admins
    try {
      await this.telegramService.notifyJefesNewService(servicioGuardado.id);
    } catch (telegramErr) {
      this.logger.error(
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
        pagos: { receiptValidation: true },
        receiptValidations: true,
      },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Listado acotado y con las colecciones cargadas en consultas aparte.
   *
   * Antes traia la tabla entera con seis niveles de relaciones resueltos por
   * LEFT JOIN: el numero de filas intermedias era el producto de las
   * colecciones y la hidratacion se hacia en memoria del proceso. Con
   * `relationLoadStrategy: 'query'` cada coleccion se pide por separado, que es
   * mas barato y da exactamente el mismo resultado.
   */
  async findAll(
    actor?: Usuarios,
    options: { limit?: number; offset?: number } = {},
  ): Promise<Servicios[]> {
    const take = Math.min(
      SERVICES_MAX_PAGE_SIZE,
      Math.max(1, Math.trunc(options.limit ?? SERVICES_DEFAULT_PAGE_SIZE)),
    );
    const skip = Math.max(0, Math.trunc(options.offset ?? 0));

    return await this.serviciosRepository.find({
      where:
        actor?.rol === 'jefe'
          ? [
              { jefeId: actor.id },
              { empleada: { jefeId: actor.id } },
              { empleada: { jefeSecundarioId: actor.id } },
            ]
          : undefined,
      relationLoadStrategy: 'query',
      relations: {
        cliente: true,
        empleada: true,
        participantes: { employee: true },
        viajes: { passengers: { employee: true } },
        pagos: { receiptValidation: true },
        receiptValidations: true,
      },
      order: { createdAt: 'DESC' },
      take,
      skip,
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
        pagos: { receiptValidation: true },
        receiptValidations: true,
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

  async findEvidence(
    actor: Usuarios,
    query: {
      kind?: string;
      status?: string;
      cursor?: string;
      limit?: string | number;
      employeeId?: string;
      from?: string;
      to?: string;
    },
  ): Promise<{ items: EvidenceItem[]; nextCursor: string | null }> {
    const kind =
      query.kind === 'uber' || query.kind === 'transferencia'
        ? query.kind
        : undefined;
    const status = query.status?.trim().toUpperCase() || undefined;
    const requestedLimit = Number(query.limit ?? 50);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(100, Math.max(1, requestedLimit))
      : 50;
    const cursor = this.decodeEvidenceCursor(query.cursor);
    const employeeId = query.employeeId?.trim() || undefined;
    const desde = this.parseEvidenceDate(query.from);
    // El limite superior se toma inclusivo: quien pide un corte hasta el
    // domingo espera que entre lo de ese domingo, no lo anterior a su medianoche.
    const hasta = this.parseEvidenceDate(query.to, true);
    const results: EvidenceItem[] = [];

    /**
     * Acota una consulta de evidencias a una empleada y a un periodo.
     *
     * La empleada puede figurar como titular del servicio o como participante
     * de uno grupal: filtrar solo por el titular dejaba fuera sus servicios en
     * grupo, que son justo los que mas comprobantes acumulan.
     */
    const acotar = (
      builder: SelectQueryBuilder<any>,
      campoFecha: string,
    ): void => {
      if (employeeId) {
        builder.andWhere(
          `(service.empleadaId = :employeeId OR EXISTS (
              SELECT 1 FROM service_participants sp
               WHERE sp.service_id = service.id AND sp.employee_id = :employeeId
            ))`,
          { employeeId },
        );
      }
      if (desde) builder.andWhere(`${campoFecha} >= :desde`, { desde });
      if (hasta) builder.andWhere(`${campoFecha} <= :hasta`, { hasta });
    };

    if (!kind || kind === 'transferencia') {
      const receipts = this.paymentReceiptValidationsRepository
        .createQueryBuilder('receipt')
        .leftJoinAndSelect('receipt.servicio', 'service')
        .leftJoinAndSelect('service.cliente', 'client')
        .leftJoin('service.empleada', 'employee')
        .where('receipt.imageUrl IS NOT NULL');
      if (actor.rol === 'jefe') {
        receipts.andWhere(
          '(service.jefeId = :actorId OR employee.jefeId = :actorId OR employee.jefeSecundarioId = :actorId)',
          { actorId: actor.id },
        );
      }
      if (status)
        receipts.andWhere('UPPER(receipt.estado) = :status', { status });
      acotar(receipts, 'receipt.createdAt');
      if (cursor) {
        receipts.andWhere(
          '(receipt.createdAt < :cursorAt OR (receipt.createdAt = :cursorAt AND receipt.id < :cursorId))',
          cursor,
        );
      }
      const rows = await receipts
        .orderBy('receipt.createdAt', 'DESC')
        .addOrderBy('receipt.id', 'DESC')
        .take(limit + 1)
        .getMany();
      results.push(
        ...rows.map((receipt) => ({
          id: receipt.id,
          kind: 'transferencia' as const,
          url: receipt.imageUrl!,
          status: receipt.estado ?? 'SIN_ESTADO',
          createdAt: receipt.createdAt.toISOString(),
          serviceId: receipt.servicioId ?? null,
          clientName:
            receipt.servicio?.cliente?.nombreTelegram ??
            receipt.clienteTelegram ??
            null,
          amount: receipt.monto == null ? null : Number(receipt.monto),
          observations: receipt.observaciones ?? null,
        })),
      );
    }

    if ((!kind || kind === 'uber') && (!status || status === 'ALMACENADA')) {
      const trips = this.viajesRepository
        .createQueryBuilder('trip')
        .innerJoinAndSelect('trip.servicio', 'service')
        .leftJoinAndSelect('service.cliente', 'client')
        .leftJoin('service.empleada', 'employee')
        .where('trip.uberScreenshotUrl IS NOT NULL')
        .andWhere('trip.uberScreenshotUploadedAt IS NOT NULL');
      acotar(trips, 'trip.uberScreenshotUploadedAt');
      if (actor.rol === 'jefe') {
        trips.andWhere(
          '(service.jefeId = :actorId OR employee.jefeId = :actorId OR employee.jefeSecundarioId = :actorId)',
          { actorId: actor.id },
        );
      }
      if (cursor) {
        trips.andWhere(
          '(trip.uberScreenshotUploadedAt < :cursorAt OR (trip.uberScreenshotUploadedAt = :cursorAt AND trip.id < :cursorId))',
          cursor,
        );
      }
      const rows = await trips
        .orderBy('trip.uberScreenshotUploadedAt', 'DESC')
        .addOrderBy('trip.id', 'DESC')
        .take(limit + 1)
        .getMany();
      results.push(
        ...rows.map((trip) => ({
          id: trip.id,
          kind: 'uber' as const,
          url: trip.uberScreenshotUrl!,
          status: 'ALMACENADA',
          createdAt: trip.uberScreenshotUploadedAt!.toISOString(),
          serviceId: trip.servicioId,
          tripId: trip.id,
          tripType: trip.tipo,
          clientName: trip.servicio?.cliente?.nombreTelegram ?? null,
        })),
      );
    }

    results.sort((left, right) => {
      const byDate = right.createdAt.localeCompare(left.createdAt);
      return byDate || right.id.localeCompare(left.id);
    });
    const page = results.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page,
      nextCursor:
        results.length > limit && last
          ? Buffer.from(`${last.createdAt}|${last.id}`).toString('base64url')
          : null,
    };
  }

  /**
   * Fecha de un filtro de evidencias.
   *
   * Acepta `YYYY-MM-DD` --lo que manda el corte semanal-- y cualquier fecha
   * completa. Los dias sueltos se anclan en UTC, igual que hace el propio corte
   * con su periodo (`getOperationalWeek`): sin la `Z` los interpretaria la zona
   * del proceso y las evidencias se saldrian del rango del corte al que
   * acompañan segun donde estuviera desplegado.
   *
   * Una cadena que no se entienda se ignora en vez de reventar la consulta: un
   * filtro mal escrito debe devolver de mas, nunca un error.
   */
  private parseEvidenceDate(
    value?: string,
    finDelDia = false,
  ): Date | undefined {
    const texto = value?.trim();
    if (!texto) return undefined;

    const soloFecha = /^\d{4}-\d{2}-\d{2}$/.test(texto);
    const fecha = new Date(
      soloFecha
        ? `${texto}T${finDelDia ? '23:59:59.999' : '00:00:00.000'}Z`
        : texto,
    );
    return Number.isNaN(fecha.getTime()) ? undefined : fecha;
  }

  private decodeEvidenceCursor(
    value?: string,
  ): { cursorAt: string; cursorId: string } | null {
    if (!value) return null;
    try {
      const decoded = Buffer.from(value, 'base64url').toString('utf8');
      const separator = decoded.lastIndexOf('|');
      const cursorAt = decoded.slice(0, separator);
      const cursorId = decoded.slice(separator + 1);
      if (
        separator < 1 ||
        Number.isNaN(Date.parse(cursorAt)) ||
        !/^[0-9a-f-]{36}$/i.test(cursorId)
      ) {
        throw new Error('invalid cursor');
      }
      return { cursorAt, cursorId };
    } catch {
      throw new BadRequestException('Cursor de evidencias inválido');
    }
  }

  async findBankAccounts(): Promise<AuthorizedBankAccounts[]> {
    return this.bankAccountsRepository.find({
      order: { activa: 'DESC', banco: 'ASC', titular: 'ASC' },
    });
  }

  async createBankAccount(
    dto: SaveBankAccountDto,
  ): Promise<AuthorizedBankAccounts> {
    return this.bankAccountsRepository.save(
      this.bankAccountsRepository.create({
        ...dto,
        cuenta: dto.cuenta?.trim() || undefined,
        clabe: dto.clabe?.trim() || undefined,
        ultimos4: dto.ultimos4?.trim() || undefined,
        alias: dto.alias?.trim() || undefined,
        activa: dto.activa ?? true,
      }),
    );
  }

  async updateBankAccount(
    id: string,
    dto: SaveBankAccountDto,
  ): Promise<AuthorizedBankAccounts> {
    const account = await this.bankAccountsRepository.findOneBy({ id });
    if (!account) throw new NotFoundException('Cuenta bancaria no encontrada');
    Object.assign(account, {
      ...dto,
      cuenta: dto.cuenta?.trim() || null,
      clabe: dto.clabe?.trim() || null,
      ultimos4: dto.ultimos4?.trim() || null,
      alias: dto.alias?.trim() || null,
    });
    return this.bankAccountsRepository.save(account);
  }

  async removeBankAccount(id: string): Promise<{ deleted: boolean }> {
    const result = await this.bankAccountsRepository.delete(id);
    if (!result.affected)
      throw new NotFoundException('Cuenta bancaria no encontrada');
    return { deleted: true };
  }

  async bankTransferDetails(): Promise<string> {
    const accounts = (
      await this.bankAccountsRepository.find({
        where: { activa: true },
        order: { banco: 'ASC', titular: 'ASC' },
      })
    ).filter((account) => account.cuenta || account.clabe);
    if (!accounts.length) {
      return (
        this.configService.get<string>('BANK_ACCOUNT_DETAILS') ||
        'Consulta con el equipo los datos bancarios autorizados.'
      );
    }
    return accounts
      .map((account, index) => {
        const details = [
          `${index + 1}. ${account.banco}`,
          `Titular: ${account.titular}`,
          account.cuenta ? `Cuenta/tarjeta: ${account.cuenta}` : null,
          account.clabe ? `CLABE: ${account.clabe}` : null,
        ].filter(Boolean);
        return details.join('\n');
      })
      .join('\n\n');
  }

  async changePaymentMethodByClient(
    serviceId: string,
    clientTelegramId: string,
    paymentMethod: 'efectivo' | 'tarjeta' | 'transferencia',
  ): Promise<Servicios> {
    const service = await this.serviciosRepository.findOne({
      where: { id: serviceId },
      relations: { cliente: true },
    });
    if (!service || service.cliente?.telegramChatId !== clientTelegramId) {
      throw new NotFoundException('Servicio activo no encontrado');
    }
    if (!['pendiente', 'agendado', 'en_curso'].includes(service.estado)) {
      throw new ConflictException(
        'El método de pago ya no puede cambiarse en este servicio',
      );
    }
    service.metodoPago = paymentMethod;
    await this.serviciosRepository.save(service);
    this.realtimeEventsService.emitToBoss(service.jefeId, {
      type: 'service_payment_method_changed',
      data: { serviceId: service.id, paymentMethod },
    });
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

  async updateForActor(
    id: string,
    updateData: any,
    actor: Usuarios,
  ): Promise<Servicios> {
    const service = await this.findOne(id);
    this.assertActorCanManageService(service, actor);

    if (actor.rol === 'jefe' && service.estado !== 'pendiente') {
      throw new ConflictException(
        'Solo puedes modificar los datos de un servicio mientras esté en estado pendiente (antes de aceptarlo o rechazarlo).',
      );
    }

    return this.update(id, updateData);
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

  async cancel(
    id: string,
    actor: Usuarios,
    dto: CancelServiceDto,
  ): Promise<{ cancelled: boolean }> {
    const service = await this.findOne(id);
    this.assertActorCanManageService(service, actor);
    if (service.serviceType === 'grupal') {
      throw new ConflictException(
        'Cancela los servicios grupales desde su organizador',
      );
    }
    if (service.estado === 'cancelado') return { cancelled: true };
    if (service.estado === 'finalizado') {
      throw new ConflictException(
        'No se puede cancelar un servicio finalizado',
      );
    }

    // Se guarda el estado previo: un servicio ya aceptado o en curso implica
    // avisarle al cliente, a la empleada y al chofer que ya estaban en camino.
    const estadoPrevio = service.estado;

    service.estado = 'cancelado';
    service.motivoCancelacion = dto.reason;
    service.notaCancelacion = dto.note?.trim() || null;
    service.canceladoPorUserId = actor.id;
    service.canceladoAt = new Date();
    await this.serviciosRepository.save(service);

    const viajesActivos = (service.viajes ?? []).filter(
      (trip) => !['finalizado', 'cancelado', 'rechazado'].includes(trip.estado),
    );
    await this.viajesRepository.update(
      {
        servicioId: id,
        estado: Not(In(['finalizado', 'cancelado', 'rechazado'])),
      },
      { estado: 'cancelado' },
    );

    // Un Uber que ya estaba despachado se pago aunque el servicio no ocurriera.
    // No se puede saber desde aqui si el viaje llego a pedirse, asi que se deja
    // marcado para que la oficina cierre el costo en vez de perderlo.
    const uberPorCerrar = viajesActivos.filter(
      (trip) =>
        trip.proveedorTransporte === 'uber' &&
        !trip.fareConfirmedAt &&
        DISPATCHED_TRIP_STATES.includes(trip.estado),
    );
    if (uberPorCerrar.length > 0) {
      await this.viajesRepository.update(
        { id: In(uberPorCerrar.map((trip) => trip.id)) },
        { canceladoConCosto: true },
      );
    }

    const anotherActiveService = await this.serviciosRepository.exists({
      where: {
        id: Not(id),
        empleadaId: service.empleadaId,
        estado: In(['pendiente', 'agendado', 'en_curso']),
      },
    });
    if (service.empleadaId && !anotherActiveService) {
      await this.serviciosRepository.manager
        .getRepository(Empleadas)
        .update(service.empleadaId, { disponible: true });
    }
    // El gasto de transporte de un servicio cancelado tambien tiene que llegar
    // al corte, aunque no haya venta ni comision que repartir.
    await this.liquidationSync.syncCancelledRecord(service.id);

    await this.notifyServiceCancelled(service, estadoPrevio, viajesActivos);

    this.realtimeEventsService.emitToBoss(service.jefeId, {
      type: 'service_cancelled',
      data: { id: service.id },
    });
    return { cancelled: true };
  }

  /**
   * Avisos de una cancelacion manual.
   *
   * Antes la cancelacion solo cambiaba estados en la base: el cliente se
   * quedaba esperando a alguien que ya no iba a llegar y el chofer seguia
   * creyendo que tenia el viaje asignado. Ningun fallo de mensajeria debe
   * revertir la cancelacion, por eso cada envio va aislado.
   */
  private async notifyServiceCancelled(
    service: Servicios,
    estadoPrevio: string,
    viajesActivos: Viajes[],
  ): Promise<void> {
    const yaConfirmado =
      estadoPrevio === 'agendado' || estadoPrevio === 'en_curso';

    if (service.cliente?.telegramChatId || service.clienteTelegramId) {
      const chatId =
        service.cliente?.telegramChatId ?? service.clienteTelegramId!;
      try {
        const mensaje = await this.aiMessageService.generate(
          'service_cancelled',
          { employeeName: service.empleada?.nombreArtistico },
          yaConfirmado
            ? 'Qué pena contigo, al final no voy a poder ir, discúlpame de verdad'
            : 'Qué pena contigo, esta vez no voy a poder ir',
        );
        await this.bot.telegram.sendMessage(chatId, mensaje);
      } catch (err) {
        this.logger.error(
          'Error al notificar al cliente de la cancelación:',
          err,
        );
      }
    }

    if (yaConfirmado && service.empleadaId) {
      try {
        const empleadaUser = await this.usuariosRepository.findOne({
          where: { id: service.empleada?.usuarioId },
        });
        if (empleadaUser?.telegramChatId) {
          await this.bot.telegram.sendMessage(
            empleadaUser.telegramChatId,
            'El servicio fue cancelado desde la oficina. Ya no tienes que asistir y quedas libre para el siguiente.',
          );
        }
      } catch (err) {
        this.logger.error(
          'Error al notificar a la empleada de la cancelación:',
          err,
        );
      }
    }

    const choferIds = [
      ...new Set(
        viajesActivos
          .map((trip) => trip.choferId)
          .filter((choferId): choferId is string => Boolean(choferId)),
      ),
    ];
    for (const choferId of choferIds) {
      try {
        const chofer = await this.choferesRepository.findOne({
          where: { id: choferId },
          relations: { usuario: true },
        });
        if (chofer?.usuario?.telegramChatId) {
          await this.bot.telegram.sendMessage(
            chofer.usuario.telegramChatId,
            'El servicio fue cancelado desde la oficina. El viaje asignado queda sin efecto y estás libre para tomar otros.',
          );
        }
      } catch (err) {
        this.logger.error(
          'Error al notificar al chofer de la cancelación:',
          err,
        );
      }
    }
  }

  async aceptar(
    id: string,
    jefeId: string,
    tipoTransporte: 'chofer' | 'uber' = 'chofer',
    bossNotes?: string,
    habitacion?: string,
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
    if (servicio.clienteId) {
      await this.disciplineService.assertOperationallyAllowed(
        'client',
        servicio.clienteId,
      );
    }

    servicio.jefeId = jefeId;
    servicio.notasJefe = bossNotes?.trim() || null;
    servicio.habitacion = habitacion?.trim() || null;

    const isFutureScheduled =
      servicio.tipoAgenda === 'programado' &&
      servicio.fechaProgramada &&
      new Date(servicio.fechaProgramada).getTime() > Date.now() + 45 * 60_000;

    if (servicio.servicioPrevioId || isFutureScheduled) {
      const gano = await this.transicionarEstado(
        servicio.id,
        'pendiente',
        'agendado',
        {
          jefeId,
          notasJefe: servicio.notasJefe,
          // La habitacion viaja dentro del propio UPDATE. Se asignaba solo al
          // objeto en memoria, y desde que el cambio de estado es una
          // actualizacion con campos explicitos --y no un `save` del objeto
          // entero-- eso significaba que no se guardaba: la empleada la veia en
          // su mensaje, pero la ficha del panel la mostraba vacia.
          habitacion: servicio.habitacion,
          transporteAgendado: tipoTransporte,
        },
      );
      if (!gano) {
        throw new ConflictException(
          'El servicio ya no está pendiente de aprobación',
        );
      }
      servicio.estado = 'agendado';
      servicio.transporteAgendado = tipoTransporte;
      this.realtimeEventsService.emitToBoss(servicio.jefeId, {
        type: 'service_scheduled',
        data: servicio,
      });
      const employeeChatId = servicio.empleada?.usuario?.telegramChatId;
      if (employeeChatId) {
        const fechaStr = servicio.fechaProgramada
          ? new Date(servicio.fechaProgramada).toLocaleString(APP_LOCALE, {
              timeZone: APP_TIME_ZONE,
            })
          : 'próximamente';
        let msg = isFutureScheduled
          ? `📅 *Cita Programada Confirmada:*\n\nTienes una cita con ${servicio.cliente?.nombreTelegram || 'Cliente'} para el ${fechaStr}.\n• *Duración:* ${servicio.duracionPactadaHoras} horas\n• *Transporte asignado:* ${tipoTransporte.toUpperCase()}`
          : `📝 Notas del jefe para tu siguiente servicio:\n${servicio.notasJefe || 'Sin notas.'}`;
        if (servicio.habitacion) {
          msg += `\n• *Habitación:* ${servicio.habitacion}`;
        }
        if (isFutureScheduled && servicio.notasJefe) {
          msg += `\n• *Notas del jefe:* ${servicio.notasJefe}`;
        }
        try {
          await this.bot.telegram.sendMessage(employeeChatId, msg, {
            parse_mode: 'Markdown',
          });
        } catch (err) {
          this.logger.error('Error notificando empleada cita agendada:', err);
        }
      }
      return servicio;
    }

    if (!servicio.horaInicioServicio) {
      servicio.horaInicioServicio = new Date();
    }

    /*
     * Arrancar el servicio, ocupar a la empleada y descartar que ya estuviera
     * ocupada, todo bajo el mismo bloqueo de su fila.
     *
     * Dos cosas se cruzaban aqui. La primera, el mismo boton pulsado dos
     * veces: la comprobacion de `pendiente` se hacia sobre una fila leida
     * antes, asi que los dos toques la superaban y se creaban dos viajes de
     * ida para el mismo servicio. La segunda, y peor: `reserveNext` permite a
     * proposito que dos clientes pidan a la vez a una empleada libre --decide
     * el jefe cual acepta-- pero nada impedia aceptar los dos, y la empleada
     * acababa con dos servicios en curso a la vez, cada uno con su chofer.
     *
     * El bloqueo es el mismo que usa `reserveNext`, asi que una reserva nueva
     * y una autorizacion no pueden colarse entre la comprobacion y el cambio.
     */
    const resultado = await this.serviciosRepository.manager.transaction(
      async (manager) => {
        await manager
          .getRepository(Empleadas)
          .createQueryBuilder('employee')
          .setLock('pessimistic_write')
          .where('employee.id = :id', { id: servicio.empleadaId })
          .getOneOrFail();

        const yaEnCurso = await manager.findOne(Servicios, {
          where: { empleadaId: servicio.empleadaId, estado: 'en_curso' },
          select: { id: true },
        });
        if (yaEnCurso) return 'ocupada' as const;

        const cambiado = await this.transicionarEstado(
          servicio.id,
          'pendiente',
          'en_curso',
          {
            jefeId,
            notasJefe: servicio.notasJefe,
            habitacion: servicio.habitacion,
            horaInicioServicio: servicio.horaInicioServicio,
          },
          manager,
        );
        if (!cambiado) return 'perdido' as const;

        await manager
          .getRepository(Empleadas)
          .update(servicio.empleadaId, { disponible: false });
        return 'aceptado' as const;
      },
    );

    if (resultado === 'ocupada') {
      throw new ConflictException(
        `${servicio.empleada?.nombreArtistico ?? 'La empleada'} ya está atendiendo otro servicio. Recházalo o espera a que termine.`,
      );
    }
    if (resultado === 'perdido') {
      throw new ConflictException(
        'El servicio ya no está pendiente de aprobación',
      );
    }
    servicio.estado = 'en_curso';

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
            inlineButtons.unshift([
              Markup.button.callback(
                'Ya estoy en el Uber',
                `eu:${viajeGuardado.id}:i`,
              ),
              Markup.button.callback('Ya llegué', `eu:${viajeGuardado.id}:f`),
            ]);
          }

          const empMsg = await this.bot.telegram.sendMessage(
            targetChatId,
            `💼 *¡Servicio en Curso!* 🟢\n\n` +
              `• *Cliente:* ${servicio.cliente?.nombreTelegram || 'Desconocido'}\n` +
              `• *Duración:* ${servicio.duracionPactadaHoras} horas\n` +
              `• *Método de Pago:* ${servicio.metodoPago.toUpperCase()}\n\n` +
              (servicio.habitacion
                ? `• *Habitación:* ${servicio.habitacion}\n\n`
                : '') +
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
        this.logger.error(
          `Error al enviar notificación de Telegram a la empleada (chatId: ${empUser.telegramChatId}):`,
          describeError(telegramErr),
        );
      }
    }

    // Notificar al cliente por Telegram si tiene telegramChatId
    if (servicio.cliente?.telegramChatId) {
      try {
        const clientMessage = await this.aiMessageService.generate(
          'service_accepted',
          { employeeName: servicio.empleada.nombreArtistico },
          'Oyeee, sí puedo ir contigo, nos vemos en un ratico',
        );
        await this.bot.telegram.sendMessage(
          servicio.cliente.telegramChatId,
          clientMessage,
        );
      } catch (telegramErr) {
        this.logger.error(
          `Error al enviar notificación de aceptación al cliente (chatId: ${servicio.cliente.telegramChatId}):`,
          describeError(telegramErr),
        );
      }
    }

    // 5. Iniciar despacho de choferes por proximidad
    let uberLink: string | undefined;
    if (tipoTransporte === 'uber') {
      uberLink = this.buildUberLinkForTrip(servicio, 'ida');
    } else {
      try {
        await this.dispatchViaje(viajeGuardado.id);
      } catch (dispatchErr) {
        this.logger.error(
          'Error al iniciar despacho de choferes por proximidad:',
          dispatchErr,
        );
      }
    }

    return {
      ...servicio,
      uberLink,
      viajeId: viajeGuardado.id,
    };
  }

  /**
   * Alarga un servicio en curso a peticion de la empleada asignada.
   *
   * Vivia entero en el manejador del boton, sin comprobar quien pulsaba y
   * sumando las horas sobre el valor leido antes: tres toques seguidos eran
   * tres horas mas en la cuenta del cliente. La suma va ahora dentro del propio
   * UPDATE y condicionada a la duracion que se leyo, asi que dos pulsaciones
   * solo pueden cuajar una vez; la segunda encuentra otra duracion y no toca
   * nada.
   */
  async extendByEmployee(
    servicioId: string,
    actorUserId: string,
    horas: number,
  ): Promise<Servicios> {
    if (!Number.isInteger(horas) || horas < 1 || horas > 12) {
      throw new BadRequestException('La extensión debe ser de 1 a 12 horas');
    }

    const servicio = await this.serviciosRepository.findOne({
      where: { id: servicioId },
      relations: { empleada: { usuario: true } },
    });
    if (!servicio) throw new NotFoundException('Servicio no encontrado');
    if (servicio.empleada?.usuarioId !== actorUserId) {
      throw new ForbiddenException('No puedes extender este servicio');
    }
    if (servicio.estado !== 'en_curso') {
      throw new ConflictException('Este servicio ya no está activo');
    }

    const duracionPrevia = Number(servicio.duracionPactadaHoras);
    const resultado = await this.serviciosRepository
      .createQueryBuilder()
      .update(Servicios)
      .set({
        duracionPactadaHoras: duracionPrevia + horas,
        // Se reabre el aviso para que vuelva a preguntar 15 minutos antes del
        // nuevo final.
        notificacionExtensionEnviada: false,
      })
      .where(
        'id = :servicioId AND estado = :estado AND duracion_pactada_horas = :duracionPrevia',
        { servicioId, estado: 'en_curso', duracionPrevia },
      )
      .execute();
    if ((resultado.affected ?? 0) === 0) {
      throw new ConflictException(
        'La duración del servicio cambió mientras tanto; vuelve a intentarlo',
      );
    }

    await this.recalculateScheduledSuccessor(servicioId);
    this.realtimeEventsService.emitToJefes({
      type: 'employee_availability_updated',
      empleadaId: servicio.empleadaId,
      activeServiceId: servicio.id,
    });

    // Se relee porque los totales los recalcula un trigger de la base.
    return (
      (await this.serviciosRepository.findOne({ where: { id: servicioId } })) ??
      servicio
    );
  }

  async dispatchScheduledTrip(
    servicioId: string,
    tipoTransporte: 'chofer' | 'uber' = 'chofer',
  ): Promise<{ uberLink?: string; viajeId?: string }> {
    const servicio = await this.serviciosRepository.findOne({
      where: { id: servicioId },
      relations: { cliente: true, empleada: { usuario: true } },
    });
    if (!servicio) throw new NotFoundException('Servicio no encontrado');
    if (servicio.estado !== 'agendado') {
      throw new ConflictException('El servicio no está en estado agendado');
    }

    servicio.estado = 'en_curso';
    if (!servicio.horaInicioServicio) {
      servicio.horaInicioServicio = new Date();
    }
    servicio.transporteAgendado = tipoTransporte;
    await this.serviciosRepository.save(servicio);

    if (servicio.empleadaId) {
      await this.serviciosRepository.manager
        .getRepository(Empleadas)
        .update(servicio.empleadaId, { disponible: false });
    }

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

    this.realtimeEventsService.emitToBoss(servicio.jefeId, {
      type: 'service_accepted',
      data: { id: servicio.id, viajeId: viajeGuardado.id },
    });

    this.realtimeEventsService.emitToEmployee(servicio.empleadaId, {
      type: 'new_service',
      data: servicio,
    });

    let uberLink: string | undefined;
    if (tipoTransporte === 'uber') {
      uberLink = this.buildUberLinkForTrip(servicio, 'ida');
    } else {
      try {
        await this.dispatchViaje(viajeGuardado.id);
      } catch (dispatchErr) {
        this.logger.error(
          'Error al iniciar despacho de choferes para cita programada:',
          dispatchErr,
        );
      }
    }

    const empUser = servicio.empleada?.usuario;
    if (empUser?.telegramChatId && empUser.telegramChatId !== '111111111') {
      try {
        const inlineButtons: any[] = [
          [
            Markup.button.callback(
              '🏁 Finalizar Servicio',
              `finalizar_servicio:${servicio.id}`,
            ),
          ],
          [
            Markup.button.callback(
              '➕ Agregar Extra',
              `agregar_extra_list:${servicio.id}`,
            ),
          ],
        ];
        if (tipoTransporte === 'uber') {
          inlineButtons.unshift([
            Markup.button.callback(
              'Ya estoy en el Uber',
              `eu:${viajeGuardado.id}:i`,
            ),
            Markup.button.callback('Ya llegué', `eu:${viajeGuardado.id}:f`),
          ]);
        }
        await this.bot.telegram.sendMessage(
          empUser.telegramChatId,
          `💼 *¡Servicio en Curso!* 🟢\n\n` +
            `• *Cliente:* ${servicio.cliente?.nombreTelegram || 'Desconocido'}\n` +
            `• *Duración:* ${servicio.duracionPactadaHoras} horas\n` +
            `• *Método de Pago:* ${servicio.metodoPago.toUpperCase()}\n\n` +
            (servicio.notasJefe
              ? `• *Notas del jefe:* ${servicio.notasJefe}\n\n`
              : '') +
            `Cuando hayas terminado el servicio, presiona el botón de abajo para finalizarlo:`,
          {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(inlineButtons),
          },
        );
      } catch (err) {
        this.logger.error('Error notificando empleada por Telegram:', err);
      }
    }

    return { uberLink, viajeId: viajeGuardado.id };
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

    // 1. Actualizar estado del servicio a 'cancelado', tambien de forma
    // condicionada: dos toques seguidos en "Rechazar" mandaban dos veces el
    // aviso al cliente y borraban dos veces el tema del grupo.
    servicio.jefeId = jefeId;
    servicio.motivoCancelacion = 'rechazado_por_jefe';
    servicio.canceladoPorUserId = jefeId;
    servicio.canceladoAt = new Date();
    const gano = await this.transicionarEstado(
      servicio.id,
      'pendiente',
      'cancelado',
      {
        jefeId,
        motivoCancelacion: servicio.motivoCancelacion,
        canceladoPorUserId: jefeId,
        canceladoAt: servicio.canceladoAt,
      },
    );
    if (!gano) {
      throw new ConflictException(
        'El servicio ya no está pendiente de aprobación',
      );
    }
    servicio.estado = 'cancelado';

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
        this.logger.error('Error deleting forum topic on reject:', err);
      }
    }

    // 4. Notificar al cliente via Telegram con opciones de reinicio
    if (servicio.clienteTelegramId) {
      try {
        const clientMessage = await this.aiMessageService.generate(
          'service_rejected',
          { employeeName: servicio.empleada?.nombreArtistico },
          'Qué pena contigo, esta vez no voy a poder ir',
        );
        await this.bot.telegram.sendMessage(
          servicio.clienteTelegramId,
          clientMessage,
        );
      } catch (err) {
        this.logger.error('Error notifying client of rejected service:', err);
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
      const eta = next.horaInicioEstimada.toLocaleTimeString(APP_LOCALE, {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: APP_TIME_ZONE,
      });
      const message = await this.aiMessageService.generateAgencyMessage(
        'scheduled_eta_updated',
        { employeeName: next.empleada?.nombreArtistico, eta },
        `Soy el asistente de la agencia. La cita anterior se extendió; la nueva hora aproximada de llegada de ${next.empleada?.nombreArtistico || 'la empleada'} es ${eta}.`,
      );
      // Va al cliente, asi que sale por el bot de la modelo como el resto de
      // los avisos suyos; el central solo sirve de respaldo.
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
                [Markup.button.url('Pedir Uber', uberLink)],
              ]),
            },
          );
        }
        const employeeChatId = next.empleada?.usuario?.telegramChatId;
        if (employeeChatId) {
          if (trip.proveedorTransporte === 'uber') {
            await this.bot.telegram.sendMessage(
              employeeChatId,
              'Tu siguiente servicio está listo. Tu transporte será en Uber. Usa los botones para confirmar cada etapa de tu trayecto.',
              {
                ...Markup.inlineKeyboard([
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
          } else {
            await this.bot.telegram.sendMessage(
              employeeChatId,
              'Tu siguiente servicio está listo. Te notificaremos cuando tu chofer esté en camino.',
            );
          }
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
      this.checkActiveServicesForExtension().catch((err: unknown) =>
        this.logger.error(
          `Error revisando servicios activos para prorroga: ${describeError(
            err,
          )}`,
        ),
      );
      this.processReturnTransportReminders().catch((err: unknown) =>
        this.logger.error(
          `Error revisando recordatorios de transporte de regreso: ${describeError(
            err,
          )}`,
        ),
      );
      this.sweepExpiredDispatchOffers().catch((err: unknown) =>
        this.logger.error(
          `Error barriendo ofertas de viaje vencidas: ${describeError(err)}`,
        ),
      );
    }, 60000);
    this.maintenanceInterval.unref?.();
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
          this.logger.error(
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
      this.logger.error(`[dispatchViaje] Viaje ${viajeId} no encontrado.`);
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
        this.logger.error(
          `[dispatchViaje] Ubicación de empleada faltante para viaje ${viajeId}.`,
        );
        await this.notifyNoDriversAvailable(
          viaje,
          'No tenemos registrada la ubicación de la empleada, así que no podemos buscarle chofer.',
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
        this.logger.error(
          `[dispatchViaje] Ubicación de cliente faltante para viaje de regreso ${viajeId}.`,
        );
        await this.notifyNoDriversAvailable(
          viaje,
          'No tenemos registrada la ubicación del cliente, así que no podemos buscarle chofer para el regreso.',
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
      // Quien cerro su jornada no vuelve a estar libre en un rato: no se le
      // ofrecen viajes hasta que la reabra.
      .andWhere('usuario.enJornada = :enJornada', { enJornada: true })
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

    // Turnos: un chofer sin ningún turno asignado sigue elegible siempre (compatibilidad
    // con choferes que no usan el sistema de turnos). Uno que sí tiene turnos asignados
    // solo es elegible si ahora mismo está dentro de uno de sus turnos activos.
    const nowInMexicoCity = new Date(
      new Date().toLocaleString('en-US', { timeZone: APP_TIME_ZONE }),
    );
    const currentDow = nowInMexicoCity.getDay();
    const yesterdayDow = (currentDow + 6) % 7;
    const currentTime = `${String(nowInMexicoCity.getHours()).padStart(2, '0')}:${String(
      nowInMexicoCity.getMinutes(),
    ).padStart(2, '0')}`;
    query
      .andWhere(
        `(
          NOT EXISTS (SELECT 1 FROM driver_shift_assignments dsa WHERE dsa.driver_id = chofer.id)
          OR EXISTS (
            SELECT 1 FROM driver_shift_assignments dsa
            JOIN driver_shifts ds ON ds.id = dsa.shift_id
            WHERE dsa.driver_id = chofer.id
              AND ds.active = true
              AND (
                (ds.starts_at <= ds.ends_at
                  AND :currentTime BETWEEN ds.starts_at AND ds.ends_at
                  AND :currentDow = ANY(ds.days_of_week))
                OR
                (ds.starts_at > ds.ends_at
                  AND (
                    (:currentTime >= ds.starts_at AND :currentDow = ANY(ds.days_of_week))
                    OR
                    (:currentTime <= ds.ends_at AND :yesterdayDow = ANY(ds.days_of_week))
                  ))
              )
          )
        )`,
      )
      .setParameter('currentTime', currentTime)
      .setParameter('currentDow', currentDow)
      .setParameter('yesterdayDow', yesterdayDow);

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
      .addSelect(
        `COALESCE((
           SELECT AVG(stars) FROM interaction_ratings
           WHERE direction = 'employee_to_driver' AND driver_id = chofer.id
         ), 2.5) / 5 * 100
         - COALESCE((
           SELECT COUNT(*) FROM conduct_reports
           WHERE subject_type = 'driver' AND subject_id = chofer.id AND outcome = 'confirmado'
             AND created_at >= now() - interval '90 days'
         ), 0) * 8`,
        'score',
      )
      .setParameter('lat', searchLat)
      .setParameter('lng', searchLng)
      .orderBy('distancia', 'ASC')
      .getRawAndEntities();

    if (result.entities.length === 0) {
      this.logger.log(
        `[dispatchViaje] No hay choferes disponibles para el viaje ${viajeId}.`,
      );
      await this.notifyNoDriversAvailable(viaje);
      return;
    }

    // El ranking de desempeño (score = calificación − reportes confirmados) actúa como
    // desempate: entre choferes dentro de una banda de proximidad al más cercano, gana
    // el de mejor score. La distancia sigue siendo el factor dominante fuera de esa banda.
    const dispatchBandKm = this.configService.get<number>(
      'DRIVER_DISPATCH_RANKING_BAND_KM',
      1.5,
    );
    const candidates = result.entities.map((entity, index) => ({
      entity,
      distancia: parseFloat(result.raw[index].distancia),
      score: parseFloat(result.raw[index].score),
    }));
    const closestDistance = candidates[0].distancia;
    const shortlist = candidates.filter(
      (candidate) => candidate.distancia <= closestDistance + dispatchBandKm,
    );
    shortlist.sort((a, b) => b.score - a.score || a.distancia - b.distancia);
    const chosen = shortlist[0];

    const nearestDriver = chosen.entity;
    const distancia = chosen.distancia;

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
          `• *Duración del Servicio:* ${viaje.servicio.duracionPactadaHoras} horas\n` +
          (viaje.servicio.habitacion
            ? `• *Habitación/Detalle:* ${viaje.servicio.habitacion}\n`
            : '') +
          `\n⚠️ Tienes *2 minutos* para aceptar esta oferta antes de que pase al siguiente chofer más cercano.`;
      } else {
        const empDestName = viaje.servicio.empleada.nombreArtistico;
        messageText =
          `📢 *¡Oferta de Viaje Disponible (Regreso)!* 🚗\n\n` +
          `• *Pasajera (Empleada):* ${empDestName}\n` +
          `• *Punto de Recogida (Cliente):* [Ver en Mapa](${mapsUrl})\n` +
          `• *Distancia a ti:* ${distancia.toFixed(2)} km\n` +
          (viaje.servicio.habitacion
            ? `• *Habitación/Detalle:* ${viaje.servicio.habitacion}\n`
            : '') +
          `\n⚠️ Tienes *2 minutos* para aceptar esta oferta antes de que pase al siguiente chofer más cercano.`;
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
        this.logger.error(
          `[dispatchViaje] Error enviando mensaje a Telegram de chofer ${nearestDriver.id}:`,
          err,
        );
        await this.rechazarOfertaManual(viaje.id, nearestDriver.id);
        return;
      }
    }

    // El vencimiento se guarda en base de datos ademas de programarse en
    // memoria: el setTimeout es la via rapida, pero si el proceso se reinicia
    // antes de dispararlo, `sweepExpiredDispatchOffers` recoge la oferta.
    await this.viajesRepository.update(viajeId, {
      ofertaExpiraEn: new Date(Date.now() + DISPATCH_OFFER_TTL_MS),
    });

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
            this.logger.log(
              `[dispatchViaje] Oferta expirada por timeout para viaje ${viajeId}, chofer ${nearestDriver.id}`,
            );
            await this.expirarOfertaYContinuar(viajeId, nearestDriver.id);
          }
        } catch (timeoutErr) {
          this.logger.error(
            `[dispatchViaje] Error en timeout de viaje ${viajeId}:`,
            timeoutErr,
          );
        }
      })();
    }, DISPATCH_OFFER_TTL_MS);
    this.dispatchTimeouts.set(viajeId, timeout);
    this.logger.log(
      `[dispatchViaje] Timeout establecido para viaje ${viajeId}`,
    );
  }

  /**
   * Avisa al jefe que el despacho de un viaje se detuvo, con el motivo exacto.
   *
   * Antes solo se usaba cuando de verdad no habia choferes disponibles; ahora
   * tambien cubre la falta de ubicacion (de la empleada o del cliente), que
   * antes dejaba el viaje mudo sin avisar a nadie. El texto por defecto
   * mantiene el mensaje original para no cambiar el caso que ya funcionaba.
   */
  private async notifyNoDriversAvailable(
    viaje: Viajes,
    motivo: string = `No se encontraron choferes disponibles para el viaje de ${viaje.tipo}.`,
  ): Promise<void> {
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
        `⚠️ ${motivo} Puedes cambiar el método de transporte a Uber.`,
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
        this.logger.error(
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
          this.logger.error(
            `Error al editar mensaje de oferta expirada:`,
            editErr,
          );
        }
      }

      viaje.choferId = null;
      viaje.telegramChoferMsgOfertaId = null;
      viaje.ofertaExpiraEn = null;
      await this.viajesRepository.save(viaje);

      await this.dispatchViaje(viajeId);
    }
  }

  /**
   * Recoge las ofertas cuyo temporizador en memoria se perdio (despliegue,
   * reinicio, o el proceso que la creo no es el que sigue vivo). Sin esto el
   * viaje se quedaba en 'notificado' indefinidamente y nadie lo reasignaba.
   */
  private async sweepExpiredDispatchOffers(): Promise<void> {
    const expired = await this.viajesRepository.find({
      where: {
        estado: 'notificado',
        ofertaExpiraEn: LessThanOrEqual(new Date()),
      },
      select: { id: true, choferId: true },
      take: 50,
    });

    for (const viaje of expired) {
      if (!viaje.choferId) continue;
      try {
        await this.expirarOfertaYContinuar(viaje.id, viaje.choferId);
      } catch (error) {
        this.logger.warn(
          `No se pudo expirar la oferta del viaje ${viaje.id}: ${describeError(
            error,
          )}`,
        );
      }
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
          this.logger.error(
            `Error al editar mensaje de oferta rechazada:`,
            editErr,
          );
        }
      }

      viaje.choferId = null;
      viaje.telegramChoferMsgOfertaId = null;
      viaje.ofertaExpiraEn = null;
      await this.viajesRepository.save(viaje);

      // El conteo va aparte y aislado: avisar al chofer o multarlo no puede
      // retrasar ni impedir que la oferta salga al siguiente.
      await this.registrarRechazoDeChofer(choferId, driverChatId).catch(
        (err) => {
          this.logger.error(
            `Error registrando el rechazo del chofer ${choferId}:`,
            err,
          );
        },
      );

      await this.dispatchViaje(viajeId);
    }
  }

  /**
   * Lleva la cuenta de ofertas rechazadas seguidas por un chofer.
   *
   * Rechazar una oferta suelta es normal: puede estar comiendo o quedarle
   * lejos. Tres seguidas ya no es circunstancial, y hasta ahora no dejaba
   * rastro: el viaje pasaba al siguiente chofer y nadie se enteraba de que uno
   * estaba rechazando todo.
   *
   * Al chofer se le avisa desde el primer rechazo con la cuenta que lleva, para
   * que la multa no le caiga por sorpresa. Al llegar al tope se aplica y el
   * contador vuelve a cero, de modo que la siguiente exige otra racha completa
   * en vez de multar en cada rechazo posterior.
   */
  private async registrarRechazoDeChofer(
    choferId: string,
    driverChatId?: string | null,
  ): Promise<void> {
    const choferes = this.serviciosRepository.manager.getRepository(Choferes);
    const chofer = await choferes.findOne({ where: { id: choferId } });
    if (!chofer) return;

    const seguidos = (chofer.rechazosConsecutivos ?? 0) + 1;
    const alcanzaElTope = seguidos >= DRIVER_REJECTION_LIMIT;

    await choferes.update(choferId, {
      rechazosConsecutivos: alcanzaElTope ? 0 : seguidos,
      ultimoRechazoAt: new Date(),
    });

    if (alcanzaElTope) {
      await this.disciplineService.applyDriverRejectionFine(
        choferId,
        seguidos,
        DRIVER_REJECTION_FINE,
      );
    }

    /*
     * El panel se entera de CADA rechazo, no solo del tercero: ver la racha
     * subir es lo que permite hablar con el chofer antes de que llegue la
     * multa.
     */
    this.realtimeEventsService.emitToJefes({
      type: 'driver.offer.rejected',
      choferId,
      choferNombre: chofer.nombre,
      rechazosSeguidos: seguidos,
      limite: DRIVER_REJECTION_LIMIT,
      multaAplicada: alcanzaElTope,
      montoMulta: alcanzaElTope ? DRIVER_REJECTION_FINE : null,
    });

    if (!driverChatId) return;
    const aviso = alcanzaElTope
      ? `Rechazaste ${seguidos} ofertas de viaje seguidas.\n\n` +
        `Se aplicó una multa de $${DRIVER_REJECTION_FINE.toLocaleString('es-MX')}. ` +
        `El contador vuelve a cero. Si tienes un motivo, háblalo con administración.`
      : `Rechazaste esta oferta. Llevas ${seguidos} de ${DRIVER_REJECTION_LIMIT} seguidas.\n\n` +
        `Al llegar a ${DRIVER_REJECTION_LIMIT} se aplica una multa de $${DRIVER_REJECTION_FINE.toLocaleString('es-MX')}. ` +
        `Aceptar un viaje pone el contador en cero.`;
    await this.bot.telegram
      .sendMessage(driverChatId, aviso)
      .catch((err: unknown) => {
        this.logger.error(
          `No se pudo avisar al chofer ${choferId} de su racha de rechazos:`,
          err,
        );
      });
  }

  /**
   * Arranca el plazo de espera de la empleada, en memoria y respaldado en
   * base.
   *
   * El setTimeout resuelve el caso comun sin depender de un ciclo periodico;
   * la fecha guardada en `esperaExpiraAt` es la red de seguridad para cuando
   * el proceso que lo inicio se reinicia o cae, ya que `sweepExpiredWaits` la
   * usa para encontrar los que quedaron sin cancelar.
   */
  startWaitTimeout(servicioId: string, durationMs: number = 600000) {
    this.clearWaitTimeout(servicioId);

    const expiraAt = new Date(Date.now() + durationMs);
    this.serviciosRepository
      .update(servicioId, { esperaExpiraAt: expiraAt })
      .catch((err) =>
        this.logger.error(
          `No se pudo guardar el plazo de espera del servicio ${servicioId}:`,
          err,
        ),
      );

    const timeout = setTimeout(() => {
      void this.handleWaitTimeoutExpired(servicioId).catch((err) => {
        this.logger.error(
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
    this.serviciosRepository
      .update(servicioId, { esperaExpiraAt: null })
      .catch((err) =>
        this.logger.error(
          `No se pudo limpiar el plazo de espera del servicio ${servicioId}:`,
          err,
        ),
      );
  }

  /**
   * Respaldo de `startWaitTimeout` para cuando su setTimeout en memoria no
   * llega a dispararse: un despliegue a mitad de la espera, o una replica
   * distinta a la que la inicio. Se puede llamar de mas sin riesgo:
   * `handleWaitTimeoutExpired` revisa el estado actual antes de cancelar
   * nada.
   */
  async sweepExpiredWaits(): Promise<void> {
    const vencidos = await this.serviciosRepository.find({
      where: {
        estado: 'en_curso',
        esperaExpiraAt: LessThanOrEqual(new Date()),
      },
      select: { id: true },
    });
    for (const servicio of vencidos) {
      await this.handleWaitTimeoutExpired(servicio.id).catch((err) =>
        this.logger.error(
          `Error en el barrido de esperas vencidas para el servicio ${servicio.id}:`,
          err,
        ),
      );
    }
  }

  async handleWaitTimeoutExpired(servicioId: string): Promise<void> {
    this.clearWaitTimeout(servicioId);

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

    this.logger.log(
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

    if (
      !servicio ||
      !['pendiente', 'agendado', 'en_curso'].includes(servicio.estado)
    )
      return;

    servicio.estado = 'cancelado';
    // La cancelacion por demora no tiene autor humano: queda como del sistema.
    servicio.motivoCancelacion = 'modelo_tardanza';
    servicio.canceladoPorUserId = null;
    servicio.canceladoAt = new Date();
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
            this.logger.error(
              'Error al notificar al chofer de cancelación:',
              err,
            );
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
          this.logger.error(
            'Error al notificar a empleada de cancelación:',
            err,
          );
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

        const candidatePool = await this.serviciosRepository.manager
          .getRepository(Empleadas)
          .find({
            where: { disponible: true, catalogoActivo: true },
            take: 15,
          });
        const confirmedRows: Array<{ subject_id: string; confirmed: number }> =
          candidatePool.length === 0
            ? []
            : await this.serviciosRepository.manager.query(
                `SELECT subject_id, COUNT(*)::int AS confirmed
                 FROM conduct_reports
                 WHERE subject_type = 'employee' AND outcome = 'confirmado'
                   AND created_at >= now() - interval '90 days'
                   AND subject_id = ANY($1::uuid[])
                 GROUP BY subject_id`,
                [candidatePool.map((emp) => emp.id)],
              );
        const confirmedByEmployee = new Map(
          confirmedRows.map((row) => [row.subject_id, row.confirmed]),
        );
        // Se ofrecen primero las empleadas con mejor score (calificación − reportes
        // confirmados), no en orden arbitrario de base de datos.
        const disponibles = candidatePool
          .map((emp) => {
            const rating =
              emp.promedioCalificacion != null
                ? Number(emp.promedioCalificacion)
                : 2.5;
            const confirmed = confirmedByEmployee.get(emp.id) ?? 0;
            const score = Math.max(
              0,
              Math.round((rating / 5) * 100 - confirmed * 8),
            );
            return { emp, score };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((entry) => entry.emp);

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
        this.logger.error('Error al notificar al cliente de cancelación:', err);
      }
    }
  }

  /**
   * Quien puede tocar los extras de un servicio, y con que catalogo.
   *
   * En un servicio individual es la empleada asignada y su propio catalogo. En
   * uno grupal cada participante agrega los suyos, asi que hay que resolver
   * primero cual de ellas esta pidiendo, y el extra tiene que salir del
   * catalogo de esa misma persona: si no, una participante podria cobrarle al
   * cliente un extra de otra.
   *
   * Se resuelve por id de usuario y no por chat de Telegram --como hace
   * `GroupServicesService.participantAccess`-- porque el portal no tiene chat.
   */
  private async resolveExtrasActor(
    servicio: Servicios,
    actorUserId: string,
  ): Promise<{ employeeId: string; participantId: string | null }> {
    if (servicio.serviceType === 'grupal') {
      const participant = await this.serviceParticipantsRepository.findOne({
        where: {
          serviceId: servicio.id,
          status: In(['activa', 'reservada', 'pendiente_pago']),
          employee: { usuario: { id: actorUserId } },
        },
        relations: { employee: { usuario: true } },
      });
      if (!participant) {
        throw new ForbiddenException('No participas en este servicio');
      }
      return {
        employeeId: participant.employeeId,
        participantId: participant.id,
      };
    }

    if (servicio.empleada?.usuarioId !== actorUserId) {
      throw new ForbiddenException('No puedes modificar este servicio');
    }
    return { employeeId: servicio.empleadaId, participantId: null };
  }

  /**
   * Catalogo de extras que la empleada puede agregar a un servicio en curso.
   *
   * Lo necesita cualquier canal que ofrezca la lista: el chat la pintaba con
   * una consulta propia y el portal habria acabado con otra, con el riesgo de
   * que una de las dos olvidara filtrar por `activo` o por participante.
   */
  async listAvailableExtras(
    servicioId: string,
    actorUserId: string,
  ): Promise<ExtrasCatalogo[]> {
    const servicio = await this.serviciosRepository.findOne({
      where: { id: servicioId },
      relations: { empleada: { usuario: true } },
    });
    if (!servicio) throw new NotFoundException('Servicio no encontrado');
    if (servicio.estado !== 'en_curso') {
      throw new ConflictException('Este servicio ya no está activo');
    }

    const { employeeId } = await this.resolveExtrasActor(servicio, actorUserId);

    // El comodin de los montos libres queda fuera: no es algo que se ofrezca,
    // y su precio es el del primer monto libre que se cobro con el.
    return this.extrasCatalogoRepository.find({
      where: { empleadaId: employeeId, activo: true, esGenerico: false },
      order: { nombre: 'ASC' },
    });
  }

  /**
   * Agrega un extra a un servicio en curso.
   *
   * Estaba repartido en los tres pasos del menu de Telegram --elegir extra,
   * elegir metodo de pago, guardar-- con las mismas cuatro comprobaciones
   * copiadas en cada uno y el estado a medias viviendo en la sesion del chat.
   * Aqui es una sola operacion: el paso a paso es cosa de la interfaz, no del
   * negocio, y el portal no tiene sesion de Telegram donde guardar nada.
   *
   * El total del servicio no se toca desde aqui: lo recalcula un trigger de la
   * base al insertar el extra, y por eso el servicio se relee al final.
   */
  async addServiceExtra(input: {
    servicioId: string;
    extraCatalogoId: string;
    metodoPago: 'tarjeta' | 'transferencia' | 'efectivo';
    actorUserId: string;
    precioCobrado?: number;
  }): Promise<AddServiceExtraResult> {
    const servicio = await this.serviciosRepository.findOne({
      where: { id: input.servicioId },
      relations: { empleada: { usuario: true } },
    });
    if (!servicio) throw new NotFoundException('Servicio no encontrado');
    if (servicio.estado !== 'en_curso') {
      throw new ConflictException('Este servicio ya no está activo');
    }

    const { employeeId, participantId } = await this.resolveExtrasActor(
      servicio,
      input.actorUserId,
    );

    const extra = await this.extrasCatalogoRepository.findOne({
      where: { id: input.extraCatalogoId },
    });
    if (!extra) throw new NotFoundException('Extra no encontrado');
    if (extra.empleadaId !== employeeId) {
      throw new ForbiddenException('Ese extra no pertenece a tu catálogo');
    }
    if (!extra.activo) {
      throw new ConflictException('Ese extra ya no está disponible');
    }

    const actor = await this.usuariosRepository.findOneBy({
      id: input.actorUserId,
    });
    if (!actor) throw new ForbiddenException('Usuario no autorizado');

    await this.extrasServicioRepository.save(
      this.extrasServicioRepository.create({
        servicioId: servicio.id,
        extraCatalogoId: extra.id,
        participantId,
        precioCobrado: input.precioCobrado ?? extra.precio,
        metodoPago: input.metodoPago,
        registradoPor: actor,
      }),
    );

    // Se relee porque el total del servicio lo recalcula un trigger al insertar.
    const actualizado =
      (await this.serviciosRepository.findOne({
        where: { id: servicio.id },
        relations: {
          cliente: true,
          empleada: true,
          extrasServicios: { extraCatalogo: true },
        },
      })) ?? servicio;

    const extras = actualizado.extrasServicios ?? [];

    return {
      servicio: actualizado,
      extraAgregado: extra,
      // Lo que se cobro de verdad, que con un monto libre no es el precio del
      // catalogo: quien avisa a la modelo o al cliente tiene que decir este.
      precioCobrado: input.precioCobrado ?? extra.precio,
      extras: extras.map((item) => ({
        id: item.id,
        nombre: item.extraCatalogo?.nombre ?? 'Extra',
        precioCobrado: Number(item.precioCobrado),
        metodoPago: item.metodoPago,
      })),
      totalExtras: extras.reduce(
        (suma, item) => suma + Number(item.precioCobrado),
        0,
      ),
    };
  }

  /**
   * Cierra un servicio individual a peticion de la empleada asignada.
   *
   * Vivia dentro del handler `conf_fin_serv` de Telegram, que era el unico sitio
   * desde el que se podia finalizar. Al abrirse el portal de la modelo hacian
   * falta las dos vias, y duplicar doscientas lineas de cierre --duracion,
   * redondeo de las horas abiertas, liquidacion, servicio encadenado,
   * disponibilidad-- habria garantizado que una de las dos se quedara atras.
   *
   * Aqui queda todo lo que cambia el estado del negocio y todo lo que hay que
   * avisar, pase por donde pase el cierre. Fuera queda solo la presentacion: el
   * resumen que ve la modelo y sus botones los arma cada canal a su manera, con
   * lo que devuelve este metodo.
   *
   * Los servicios grupales no entran: los cierra la responsable a traves de
   * `GroupServicesService.finishByResponsible`, que reparte entre participantes.
   */
  async finishByEmployee(
    servicioId: string,
    actorUserId: string,
  ): Promise<FinishByEmployeeResult> {
    const servicio = await this.serviciosRepository.findOne({
      where: { id: servicioId },
      relations: {
        cliente: true,
        empleada: { usuario: true, jefe: true },
        jefe: true,
      },
    });

    if (!servicio) {
      throw new NotFoundException('Servicio no encontrado');
    }
    if (servicio.serviceType === 'grupal') {
      throw new ConflictException(
        'Un servicio grupal lo cierra la responsable desde su flujo de grupo',
      );
    }
    if (servicio.empleada?.usuarioId !== actorUserId) {
      throw new ForbiddenException('No puedes finalizar este servicio');
    }
    if (servicio.estado !== 'en_curso') {
      throw new ConflictException('Este servicio ya no está activo');
    }

    const fin = new Date();
    servicio.estado = 'finalizado';
    servicio.horaFinServicio = fin;

    const transcurridoMs = servicio.horaInicioServicio
      ? fin.getTime() - new Date(servicio.horaInicioServicio).getTime()
      : 0;

    // Sin hora de inicio no hay nada que medir: se respeta lo pactado.
    const duracionFormatted = servicio.horaInicioServicio
      ? formatServiceDuration(transcurridoMs)
      : `${servicio.duracionPactadaHoras} horas`;
    servicio.duracionFinalHoras = servicio.horaInicioServicio
      ? Number((transcurridoMs / 3_600_000).toFixed(2))
      : Number(servicio.duracionPactadaHoras);

    /*
     * Duracion abierta: las horas facturables se fijan ahora, redondeando hacia
     * arriba a partir de los 15 minutos. Al escribir `duracionPactadaHoras` el
     * trigger de la base recalcula los totales, asi que el importe no se toca
     * desde aqui.
     */
    let horasFacturadas: number | null = null;
    if (servicio.duracionIndefinida) {
      horasFacturadas = roundOpenEndedHours(transcurridoMs);
      servicio.duracionPactadaHoras = horasFacturadas;
      servicio.duracionFinalHoras = horasFacturadas;
    }

    servicio.estadoLiquidacion = 'transporte_pendiente';
    servicio.recordatoriosRegreso = 0;
    servicio.proximoRecordatorioRegresoAt = new Date(Date.now() + 5 * 60_000);
    await this.serviciosRepository.save(servicio);

    const successor = await this.activateScheduledSuccessor(servicio.id);
    if (successor.hasSuccessor) {
      // Encadena con otro servicio: no hay regreso que cuadrar ni corte abierto.
      servicio.estadoLiquidacion = 'cerrada';
      servicio.proximoRecordatorioRegresoAt = null;
      await this.serviciosRepository.save(servicio);
    }

    this.realtimeEventsService.emitToJefes({
      type: 'employee_availability_updated',
      empleadaId: servicio.empleadaId,
      completedServiceId: servicio.id,
      hasScheduledSuccessor: successor.hasSuccessor,
    });

    // Se relee porque los totales los recalcula un trigger, no este proceso.
    const servicioConTotal =
      (await this.serviciosRepository.findOne({
        where: { id: servicio.id },
      })) ?? servicio;

    if (servicio.empleadaId && !successor.hasSuccessor) {
      try {
        await this.empleadasRepository.update(servicio.empleadaId, {
          disponible: true,
        });
      } catch (error) {
        this.logger.error(
          `No se pudo liberar a la empleada ${servicio.empleadaId}:`,
          error,
        );
      }
      await this.notifyClientsWaitingForEmployee(servicio.empleadaId);
    }

    if (horasFacturadas) {
      await this.requestOpenEndedFinalPayment(
        servicioConTotal,
        servicio.cliente?.telegramChatId ?? null,
        horasFacturadas,
        duracionFormatted,
      );
    }

    if (!successor.hasSuccessor) {
      try {
        await this.requestReturnTransport(servicio.id);
      } catch (error) {
        this.logger.error(
          `No se pudo solicitar el transporte de regreso del servicio ${servicio.id}:`,
          error,
        );
      }
    }

    return {
      servicio: servicioConTotal,
      clienteNombre: servicio.cliente?.nombreTelegram ?? null,
      clienteChatId: servicio.cliente?.telegramChatId ?? null,
      duracionFormatted,
      horasFacturadas,
      hasSuccessor: successor.hasSuccessor,
    };
  }

  /**
   * Avisa a los clientes que decidieron esperar a esta modelo.
   *
   * Estaba en el handler de Telegram y por eso solo corria cuando el servicio se
   * cerraba desde el chat: al finalizar desde el portal, quien estaba esperando
   * no se enteraba nunca de que ya habia quedado libre.
   */
  private async notifyClientsWaitingForEmployee(
    empleadaId: string,
  ): Promise<void> {
    let waiting: TelegramSession[];
    try {
      /*
       * Filtrado en SQL, apoyado en el indice de expresion de la migracion
       * `IndexTelegramSessionLookups`. Antes se traia la tabla entera para
       * quedarse con las pocas filas que esperan a esta empleada, y cada fila
       * carga su historial de conversacion en JSONB: son megabytes por cierre
       * de servicio.
       */
      waiting = await this.telegramSessionRepository
        .createQueryBuilder('sesion')
        .where("sesion.data->>'esperandoEmpleadaId' = :empleadaId", {
          empleadaId,
        })
        .getMany();
    } catch (error) {
      this.logger.error(
        'No se pudieron revisar las sesiones en espera de la empleada:',
        error,
      );
      return;
    }

    if (!waiting.length) return;

    const empleada = await this.empleadasRepository.findOne({
      where: { id: empleadaId },
    });
    const nombre = empleada?.nombreArtistico || 'ella';

    for (const item of waiting) {
      /*
       * La clave se descompone con `parseSessionKey`, no a mano. Leer
       * `key.split(':')[0]` daba el id de la EMPLEADA en las sesiones que
       * guardo un bot dedicado, asi que el aviso salia hacia un destinatario
       * inexistente y quien se habia quedado esperando no se enteraba nunca.
       */
      const clientTelegramId = parseSessionKey(item.key)?.fromId;
      if (!clientTelegramId) continue;

      const mensaje = `¡Ya quedé libre mi amor! Aquí sigo, dime cómo la armamos 😘`;
      try {
        await this.bot.telegram.sendMessage(clientTelegramId, mensaje);

        item.data.esperandoEmpleadaId = undefined;
        item.data.selectedEmployeeBusy = false;
        item.data.waitingForBusyChoice = false;
        await this.telegramSessionRepository.save(item);

        const client = await this.clientesRepository.findOne({
          where: { telegramChatId: clientTelegramId },
        });
        if (client && item.data.bookingSessionId) {
          await this.conversationsRepository.save(
            this.conversationsRepository.create({
              clienteId: client.id,
              servicioId: null,
              bookingSessionId: item.data.bookingSessionId,
              emisor: 'ia',
              mensaje,
              iaActiva: true,
            }),
          );
        }
      } catch (error) {
        this.logger.warn(
          `No se pudo avisar al cliente ${clientTelegramId} que ${nombre} quedó libre:`,
          error,
        );
      }
    }
  }

  /**
   * Cierra el cobro de un servicio de duracion abierta.
   *
   * Le pasa al cliente el total ya con las horas contadas y, si pago por
   * transferencia, le pide el comprobante en ese momento: en un servicio
   * abierto no se puede cobrar por adelantado porque el importe no se conoce
   * hasta que termina.
   */
  private async requestOpenEndedFinalPayment(
    servicio: Servicios,
    clienteChatId: string | null,
    horasFacturadas: number,
    duracionFormatted: string,
  ): Promise<void> {
    if (!clienteChatId) return;

    const formatoMoneda = new Intl.NumberFormat(APP_LOCALE, {
      style: 'currency',
      currency: 'MXN',
    });
    const horasTexto =
      horasFacturadas === 1 ? '1 hora' : `${horasFacturadas} horas`;

    let mensaje =
      `*Cuenta final del servicio*\n\n` +
      `*Tiempo real:* ${duracionFormatted}\n` +
      `*Horas cobradas:* ${horasTexto} (se redondea hacia arriba a partir de los 15 minutos)\n` +
      `*Total a pagar:* ${formatoMoneda.format(Number(servicio.totalFinal))}`;

    if (servicio.metodoPago === 'transferencia') {
      try {
        const bankDetails = await this.bankTransferDetails();
        mensaje += `\n\n${bankDetails}\n\nMándame una *FOTO* del comprobante por ese total, porfa 😘`;
      } catch (error) {
        this.logger.error(
          'No se pudieron obtener las cuentas para el cobro final:',
          error,
        );
        mensaje += `\n\nEn un momentico te paso los datos para la transferencia.`;
      }

      try {
        await this.serviciosRepository.update(servicio.id, {
          cobroFinalPendiente: true,
        });
      } catch (error) {
        this.logger.error(
          'No se pudo marcar el cobro final pendiente del servicio:',
          error,
        );
      }
    }

    try {
      await this.bot.telegram.sendMessage(clienteChatId, mensaje, {
        parse_mode: 'Markdown',
      });
      await this.recordAgencyMessage(servicio, mensaje);
    } catch (error) {
      this.logger.error('No se pudo enviar la cuenta final al cliente:', error);
    }
  }

  async requestReturnTransport(servicioId: string): Promise<void> {
    const servicio = await this.serviciosRepository.findOne({
      where: { id: servicioId },
      relations: {
        jefe: true,
        empleada: { jefe: true, jefeSecundario: true },
      },
    });
    if (!servicio) throw new NotFoundException('Servicio no encontrado');

    const nextReminder = new Date(Date.now() + 5 * 60_000);
    await this.serviciosRepository.update(servicio.id, {
      estadoLiquidacion: 'transporte_pendiente',
      recordatoriosRegreso: 0,
      proximoRecordatorioRegresoAt: nextReminder,
    });
    await this.sendReturnTransportPrompt(servicio, false);
    await this.liquidationSync
      .syncOfficeRecord(servicio.id)
      .catch((error) =>
        this.logger.error(
          `[requestReturnTransport] El aviso se envió, pero no se pudo sincronizar la liquidación del servicio ${servicio.id}:`,
          error,
        ),
      );
  }

  /**
   * Adelanta al jefe la decision del regreso, en cuanto la empleada dice que no
   * va a extender el servicio.
   *
   * Antes el jefe se enteraba al finalizar: cuando le llegaba la pregunta, la
   * empleada ya estaba esperando en la puerta y el chofer o el Uber empezaban a
   * buscarse desde cero. La empleada rechaza la extension quince minutos antes
   * del final, y ese margen alcanza para tener el regreso cuadrado.
   *
   * No se toca `estadoLiquidacion`: el servicio sigue en curso y marcarlo como
   * transporte pendiente lo sacaria de los activos antes de tiempo. Este aviso
   * se adelanta al de `requestReturnTransport`, no lo sustituye; los botones
   * son los mismos, asi que si el jefe resuelve aqui, al finalizar ya no queda
   * nada que decidir.
   */
  async notifyReturnTransportAhead(servicioId: string): Promise<void> {
    const servicio = await this.serviciosRepository.findOne({
      where: { id: servicioId },
      relations: {
        jefe: true,
        empleada: { jefe: true, jefeSecundario: true },
      },
    });
    if (!servicio || servicio.estado !== 'en_curso') return;

    const fin = servicio.horaInicioServicio
      ? new Date(
          new Date(servicio.horaInicioServicio).getTime() +
            Number(servicio.duracionPactadaHoras || 1) * 3_600_000,
        )
      : null;
    const hora = fin
      ? fin.toLocaleTimeString(APP_LOCALE, {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: APP_TIME_ZONE,
        })
      : null;

    const texto =
      `${servicio.empleada?.nombreArtistico || 'La empleada'} no va a extender el servicio.` +
      (hora ? ` Termina a las ${hora}.` : '') +
      `\n\nVe cuadrando su viaje de regreso:`;

    await this.sendReturnTransportPrompt(servicio, false, texto);
  }

  private async sendReturnTransportPrompt(
    servicio: Servicios,
    reminder: boolean,
    /** Texto propio. Sin el se usa el de un servicio ya finalizado. */
    customText?: string,
  ): Promise<void> {
    const topic = this.getServiceTopic(servicio);
    const text =
      customText ??
      `${reminder ? 'Recordatorio\n\n' : ''}La empleada ${servicio.empleada?.nombreArtistico || ''} finalizó el servicio. ¿Cómo será su viaje de regreso?`;
    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback(
          'Regreso con chofer',
          `regreso_transporte:${servicio.id}:interno`,
        ),
        Markup.button.callback(
          'Regreso con Uber',
          `regreso_transporte:${servicio.id}:uber`,
        ),
      ],
    ]);
    const messages: Array<{ destination: string; request: Promise<unknown> }> =
      [];
    const usedChatIds = new Set<string>();
    if (topic) {
      usedChatIds.add(String(topic.chatId));
      messages.push({
        destination: `hilo ${topic.threadId}`,
        request: this.bot.telegram.sendMessage(topic.chatId, text, {
          message_thread_id: topic.threadId,
          ...keyboard,
        }),
      });
    }
    const bosses = [
      servicio.jefe,
      servicio.empleada?.jefe,
      servicio.empleada?.jefeSecundario,
    ].filter(
      (boss, index, rows) =>
        boss && rows.findIndex((item) => item?.id === boss.id) === index,
    );
    for (const boss of bosses) {
      if (boss!.grupoTelegramId) {
        const groupId = String(boss!.grupoTelegramId);
        if (!usedChatIds.has(groupId)) {
          usedChatIds.add(groupId);
          messages.push({
            destination: `grupo del jefe ${boss!.id}`,
            request: this.bot.telegram.sendMessage(groupId, text, {
              ...keyboard,
            }),
          });
        }
      }
    }
    if (!messages.length) {
      this.logger.warn(
        `El servicio ${servicio.id} no tiene un jefe con Telegram ni un hilo de servicio configurado`,
      );
      return;
    }
    const results = await Promise.allSettled(
      messages.map((item) => item.request),
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `No se pudo enviar la solicitud de regreso a ${messages[index].destination}`,
          result.reason,
        );
      }
    });
  }

  async processReturnTransportReminders(): Promise<void> {
    const pending = await this.serviciosRepository.find({
      where: {
        estadoLiquidacion: 'transporte_pendiente',
        proximoRecordatorioRegresoAt: LessThanOrEqual(new Date()),
      },
      relations: {
        jefe: true,
        empleada: { jefe: true, jefeSecundario: true },
      },
    });

    for (const servicio of pending) {
      const count = servicio.recordatoriosRegreso + 1;
      await this.sendReturnTransportPrompt(servicio, true).catch((error) =>
        this.logger.error('Error sending return reminder:', error),
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
            .filter((user) => user.grupoTelegramId || user.telegramChatId)
            .map((user) =>
              this.bot.telegram.sendMessage(
                user.grupoTelegramId || user.telegramChatId!,
                `El servicio ${servicio.id} sigue sin transporte de regreso después de tres recordatorios.`,
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
    await this.liquidationSync
      .syncOfficeRecord(result.servicio.id)
      .catch((error) =>
        this.logger.error(
          `[chooseReturnTransport] El viaje ${result.trip.id} se creó, pero no se pudo sincronizar la liquidación:`,
          error,
        ),
      );

    if (provider === 'interno') {
      await this.dispatchViaje(result.trip.id).catch((error) =>
        this.logger.error(
          `[chooseReturnTransport] El viaje ${result.trip.id} se creó, pero el despacho inicial falló:`,
          error,
        ),
      );
      const employee = await this.serviciosRepository.findOne({
        where: { id: result.servicio.id },
        relations: { empleada: { usuario: true } },
      });
      const employeeChatId = employee?.empleada?.usuario?.telegramChatId;
      if (employeeChatId) {
        await this.bot.telegram
          .sendMessage(
            employeeChatId,
            '🚗 Tu viaje de regreso con chofer ya fue solicitado. Te avisaremos cuando un chofer lo acepte.',
          )
          .catch((error) =>
            this.logger.error(
              `[chooseReturnTransport] No se pudo avisar a la empleada del viaje ${result.trip.id}:`,
              error,
            ),
          );
      }
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
    const uberLink = employee
      ? this.buildUberLinkForTrip(employee, 'regreso')
      : undefined;
    if (employeeChatId) {
      await this.bot.telegram
        .sendMessage(
          employeeChatId,
          'Tu transporte de regreso será en Uber. Confirma cada etapa cuando abordes y llegues.',
          {
            ...Markup.inlineKeyboard([
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
        .catch((error) =>
          this.logger.error(
            `[chooseReturnTransport] No se pudo avisar a la empleada del Uber ${result.trip.id}:`,
            error,
          ),
        );
    }
    return { trip: result.trip, uberLink };
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
        if (trip.choferId && trip.estado !== 'notificado') {
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
        trip.uberScreenshotUrl = null;
        trip.uberScreenshotUploadedAt = null;
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
    const pickupLat = ida
      ? servicio.empleada?.ubicacionLat
      : servicio.ubicacionClienteLat;
    const pickupLng = ida
      ? servicio.empleada?.ubicacionLng
      : servicio.ubicacionClienteLng;
    const dropoffLat = ida
      ? servicio.ubicacionClienteLat
      : servicio.empleada?.ubicacionLat;
    const dropoffLng = ida
      ? servicio.ubicacionClienteLng
      : servicio.empleada?.ubicacionLng;

    let url = 'https://m.uber.com/ul/?action=setPickup';
    if (pickupLat && pickupLng) {
      url += `&pickup[latitude]=${pickupLat}&pickup[longitude]=${pickupLng}`;
    } else {
      url += '&pickup=my_location';
    }
    if (dropoffLat && dropoffLng) {
      url += `&dropoff[latitude]=${dropoffLat}&dropoff[longitude]=${dropoffLng}`;
    }
    return url;
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
    const fileUrl = await this.bot.telegram.getFileLink(fileId);
    const evidence = await this.uploadService.uploadEvidenceFromUrl({
      sourceUrl: fileUrl.href,
      folder: 'uber',
      scopeId: trip.id,
    });
    await this.viajesRepository.update(trip.id, {
      telegramUberFileId: fileId,
      uberScreenshotUrl: evidence.url,
      uberScreenshotUploadedAt: new Date(),
    });
    const chatId = trip.servicio.empleada?.usuario?.telegramChatId;
    if (chatId) {
      // El `file_id` vale porque quien sube la captura y quien la recibe estan
      // en el mismo bot: un `file_id` solo sirve dentro del bot que recibio el
      // archivo.
      await this.bot.telegram.sendPhoto(chatId, fileId, {
        caption: `📱 Datos del Uber de ${trip.tipo === 'ida' ? 'ida' : 'regreso'}.`,
      });
    }
  }

  async saveUberScreenshotFromDashboard(
    tripId: string,
    actorId: string,
    file: any,
  ): Promise<{ fileId: string; imageUrl: string }> {
    const trip = await this.getAuthorizedUberTrip(tripId, actorId);
    const chatId = trip.servicio.empleada?.usuario?.telegramChatId;
    if (!chatId) {
      throw new ConflictException(
        'La empleada no tiene una cuenta de Telegram vinculada',
      );
    }

    const evidence = await this.uploadService.uploadEvidence({
      buffer: file.buffer,
      contentType: file.mimetype,
      folder: 'uber',
      scopeId: trip.id,
    });
    const uploadedAt = new Date();
    await this.viajesRepository.update(trip.id, {
      uberScreenshotUrl: evidence.url,
      uberScreenshotUploadedAt: uploadedAt,
    });
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
      uberScreenshotUrl: evidence.url,
      uberScreenshotUploadedAt: uploadedAt,
    });
    return { fileId, imageUrl: evidence.url };
  }

  async confirmUberFare(
    tripId: string,
    actorId: string,
    amount: number,
  ): Promise<void> {
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      Math.abs(Math.round(amount * 100) - amount * 100) > 1e-8
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
    const hasScreenshot = Boolean(
      trip.uberScreenshotUrl || trip.telegramUberFileId,
    );
    const override = !hasScreenshot && actor.rol === 'admin';
    if (!hasScreenshot && !override) {
      throw new ConflictException(
        'El jefe debe adjuntar la captura del Uber antes de confirmar la tarifa',
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
        await this.serviciosRepository.update(trip.servicioId, {
          estadoLiquidacion: 'cerrada',
        });
        setTimeout(() => {
          this.deleteServiceTopic(trip.servicio).catch((error) =>
            this.logger.error(
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

  /**
   * Viajes cancelados que siguen esperando el cierre de su costo.
   *
   * Es la bandeja que evita que un Uber ya pagado se pierda: mientras aparezca
   * aqui, hay dinero gastado que todavia no entro a ningun corte.
   */
  async listPendingCancellationCosts(actor: Usuarios): Promise<
    Array<{
      id: string;
      tipo: 'ida' | 'regreso';
      servicioId: string;
      empleadaNombre: string | null;
      canceladoAt: Date | null;
      motivoCancelacion: string | null;
      notaCancelacion: string | null;
      uberScreenshotUrl: string | null;
    }>
  > {
    const trips = await this.viajesRepository.find({
      where: {
        canceladoConCosto: true,
        fareConfirmedAt: IsNull(),
        ...(actor.rol === 'admin' ? {} : { servicio: { jefeId: actor.id } }),
      },
      relations: { servicio: { empleada: true } },
      order: { horaNotificacion: 'DESC' },
      take: 100,
    });

    return trips.map((trip) => ({
      id: trip.id,
      tipo: trip.tipo,
      servicioId: trip.servicioId,
      empleadaNombre: trip.servicio?.empleada?.nombreArtistico ?? null,
      canceladoAt: trip.servicio?.canceladoAt ?? null,
      motivoCancelacion: trip.servicio?.motivoCancelacion ?? null,
      notaCancelacion: trip.servicio?.notaCancelacion ?? null,
      uberScreenshotUrl: trip.uberScreenshotUrl,
    }));
  }

  /**
   * Cierra el costo de un viaje cancelado que ya estaba despachado.
   *
   * Es la contraparte de la bandera que pone `cancel`: la oficina confirma la
   * tarifa que de verdad se pago, o declara con un cero que el viaje nunca
   * llego a salir. En ambos casos el viaje deja de estar pendiente y el corte
   * se recalcula con el gasto real.
   */
  async settleCancelledTripCost(
    tripId: string,
    actorId: string,
    amount: number,
    chargeToClient = false,
  ): Promise<{ settled: true; amount: number; chargeToClient: boolean }> {
    if (
      !Number.isFinite(amount) ||
      amount < 0 ||
      Math.abs(Math.round(amount * 100) - amount * 100) > 1e-8
    ) {
      throw new BadRequestException(
        'El costo no puede ser negativo y admite máximo dos decimales',
      );
    }

    const trip = await this.getAuthorizedUberTrip(tripId, actorId);
    if (!trip.canceladoConCosto) {
      throw new ConflictException(
        'Este viaje no quedó pendiente de cerrar por una cancelación',
      );
    }
    if (trip.fareConfirmedAt) {
      throw new ConflictException('El costo de este viaje ya fue cerrado');
    }

    const actor = await this.usuariosRepository.findOneBy({ id: actorId });
    if (!actor) throw new ConflictException('Usuario no autorizado');

    // Declarar que no costo nada no necesita comprobante; cobrar si.
    const hasScreenshot = Boolean(
      trip.uberScreenshotUrl || trip.telegramUberFileId,
    );
    const override = amount > 0 && !hasScreenshot;
    if (override && actor.rol !== 'admin') {
      throw new ConflictException(
        'Sin captura del Uber solo un administrador puede registrar el costo',
      );
    }

    // Un viaje que no costo nada no se le puede cobrar a nadie.
    const cobrado = amount > 0 && chargeToClient;

    await this.viajesRepository.update(trip.id, {
      tarifa: amount,
      fareConfirmedAt: new Date(),
      fareConfirmedByUserId: actorId,
      fareConfirmationOverride: override,
      costoCobradoAlCliente: cobrado,
    });
    await this.liquidationSync.syncCancelledRecord(trip.servicioId);

    return { settled: true, amount, chargeToClient: cobrado };
  }

  /**
   * Corrige el motivo de una cancelacion ya registrada.
   *
   * Los servicios cancelados antes de que existiera el campo no tienen motivo,
   * y en una cancelacion apurada se elige mal. Sin poder corregirlo, el dato
   * que decide quien asume el costo se queda mal para siempre. No se toca
   * `canceladoPorUserId`: quien cancelo sigue siendo quien cancelo, aunque otro
   * complete despues el motivo.
   */
  async updateCancellationDetails(
    id: string,
    actor: Usuarios,
    dto: CancelServiceDto,
  ): Promise<{ updated: true }> {
    const service = await this.findOne(id);
    this.assertActorCanManageService(service, actor);

    if (service.estado !== 'cancelado') {
      throw new ConflictException(
        'Solo un servicio cancelado tiene motivo de cancelación',
      );
    }

    await this.serviciosRepository.update(id, {
      motivoCancelacion: dto.reason,
      notaCancelacion: dto.note?.trim() || null,
    });

    return { updated: true };
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
    const text =
      `✅ *Total definitivo del servicio*\n\n` +
      `• Servicio base: $${Number(servicio.totalBase).toFixed(2)}\n` +
      `• Transporte: $${Number(servicio.totalTransporte).toFixed(2)}\n` +
      `• *Total a pagar: $${Number(servicio.totalFinal).toFixed(2)}*\n\n` +
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
            {
              parse_mode: 'Markdown',
            },
          );
          await this.serviciosRepository.update(servicio.id, {
            telegramEmpleadaMensajeId: message.message_id.toString(),
          });
        }
      } catch {
        const message = await this.bot.telegram.sendMessage(
          employeeChatId,
          employeeText,
          {
            parse_mode: 'Markdown',
          },
        );
        await this.serviciosRepository.update(servicio.id, {
          telegramEmpleadaMensajeId: message.message_id.toString(),
        });
      }
    }
    if (servicio.clienteId) {
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
      /*
       * Tambien desde 'en_camino' y 'llegado'.
       *
       * El jefe y la empleada mueven el mismo viaje por dos caminos: el jefe
       * marca el Uber en camino y luego que llego, la empleada marca que ya
       * subio. Exigir aqui 'aceptado' hacia que el segundo paso del jefe --el
       * mismo mensaje que le dice a ella "cuando subas, presiona Ya estoy en
       * el Uber"-- dejara ese boton inservible: al pulsarlo recibia "El viaje
       * ya no puede iniciarse".
       */
      if (!['aceptado', 'en_camino', 'llegado'].includes(trip.estado))
        throw new ConflictException('El viaje ya no puede iniciarse');
      resultingState = 'en_curso';
      await this.viajesRepository.update(trip.id, {
        estado: resultingState,
        horaInicioViaje: new Date(),
      });
    } else if (action === 'employee_arrived') {
      if (!['en_curso', 'finalizado'].includes(trip.estado))
        throw new ConflictException('Primero confirma que vas en camino');
      const now = new Date();
      resultingState = 'finalizado';
      if (trip.estado !== 'finalizado') {
        await this.viajesRepository.update(trip.id, {
          estado: resultingState,
          horaFinViaje: now,
        });
      }
      if (trip.tipo === 'regreso') {
        await this.serviciosRepository.update(trip.servicioId, {
          ...(trip.servicio.horaLlegadaCasa ? {} : { horaLlegadaCasa: now }),
          // El servicio solo se cierra aquí si ya no falta que el jefe suba
          // la captura ni confirme la tarifa del Uber de regreso; si sigue
          // pendiente, se cierra en confirmUberFare para no desaparecer del
          // panel de "Activos" antes de tiempo.
          ...(trip.fareConfirmedAt ? { estadoLiquidacion: 'cerrada' } : {}),
        });
        await this.liquidationSync
          .syncOfficeRecord(trip.servicioId)
          .catch((error) =>
            this.logger.error(
              `El viaje ${trip.id} finalizó, pero no se pudo sincronizar su liquidación`,
              error,
            ),
          );
      } else {
        /*
         * Viaje de ida: la hora real de inicio es cuando la empleada llega,
         * no cuando el jefe autorizo el servicio. Con chofer propio esto ya
         * se corrige al llegar (telegram-driver.update.ts); con Uber antes
         * solo se corregia si el servicio era una cita agendada, dejando el
         * traslado facturado como tiempo de servicio en los inmediatos.
         */
        const eraAgendado = trip.servicio.estado === 'agendado';
        await this.serviciosRepository.update(trip.servicioId, {
          horaInicioServicio: now,
          ...(eraAgendado
            ? {
                estado: 'en_curso',
                servicioPrevioId: null,
                horaInicioEstimada: now,
              }
            : {}),
        });
        if (eraAgendado) {
          this.realtimeEventsService.emitToBoss(trip.servicio.jefeId, {
            type: 'scheduled_service_started',
            data: { serviceId: trip.servicioId, tripId: trip.id },
          });
          await this.notifyScheduledServiceStarted(trip.servicioId);
        }
      }
    }

    const employeeChatId = trip.servicio.empleada?.usuario?.telegramChatId;
    if (bossAction && employeeChatId && trip.proveedorTransporte === 'uber') {
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
      if (trip.servicio.cliente?.telegramChatId) {
        const clientMessage = await this.aiMessageService.generate(
          action === 'employee_arrived'
            ? 'employee_arrived'
            : 'employee_on_the_way',
          { employeeName: trip.servicio.empleada?.nombreArtistico },
          action === 'employee_arrived'
            ? 'Ya llegué al punto que cuadramos, aquí te espero'
            : 'Ya voy en camino, nos vemos pronto',
        );
        await this.bot.telegram.sendMessage(
          trip.servicio.cliente.telegramChatId,
          clientMessage,
        );
      }
      if (trip.servicio.clienteId) {
        this.realtimeEventsService.emitToClient(trip.servicio.clienteId, {
          type: event,
          data: { tripId: trip.id, serviceId: trip.servicioId },
        });
      }
    }
    if (
      action === 'employee_arrived' &&
      trip.tipo === 'regreso' &&
      trip.servicio.clienteId
    ) {
      // No notificar al cliente que la empleada llegó a su casa en viaje de regreso
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
          this.logger.error(
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
