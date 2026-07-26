import {
  BadRequestException,
  ConflictException,
  forwardRef,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  MoreThan,
  Not,
  Repository,
} from 'typeorm';
import { Clientes } from '../clients/entities/client.entity';
import { DisciplineService } from '../discipline/discipline.service';
import { Empleadas } from '../employees/entities/employee.entity';
import { RealtimeEventsService } from '../realtime/realtime.service';
import { PaymentReceiptValidations } from '../services/entities/payment-receipt-validation.entity';
import { Servicios } from '../services/entities/service.entity';
import { TransportSetting } from '../transport-operations/entities/transport-setting.entity';
import { PresetServiceLocation } from '../transport-operations/entities/preset-service-location.entity';
import { EmployeeCashObligation } from '../transport-operations/entities/employee-cash-obligation.entity';
import { Viajes } from '../trips/entities/trip.entity';
import { Usuarios } from '../users/entities/user.entity';
import { ConversacionesTelegram } from '../telegram-conversations/entities/telegram-conversation.entity';
import {
  AddGroupParticipantDto,
  ChangeGroupDurationDto,
  ChangeGroupResponsibleDto,
  ConfigureGroupTransportDto,
  ConfirmGroupQuoteDto,
  CreateGroupRequestDto,
  ManualTransportChargeDto,
  RegisterGroupPaymentDto,
  RemoveGroupParticipantDto,
  ReserveGroupSelectionDto,
  UpdateGroupRequestDto,
} from './dto/group-service.dto';
import { GroupServiceRequest } from './entities/group-service-request.entity';
import { GroupServiceRequestSelection } from './entities/group-service-request-selection.entity';
import { ServiceGroupAudit } from './entities/service-group-audit.entity';
import { ServiceParticipant } from './entities/service-participant.entity';
import { ServicePayment } from './entities/service-payment.entity';
import { TripPassenger } from './entities/trip-passenger.entity';
import { InjectBot } from 'nestjs-telegraf';
import { Context, Markup, Telegraf } from 'telegraf';
import { ConfigService } from '@nestjs/config';
import { OfficeLiquidationSyncService } from '../liquidations/office-liquidation-sync.service';
import { ServicesService } from '../services/services.service';
import { GroupBossAssignmentService } from './group-boss-assignment.service';

type Actor = Pick<Usuarios, 'id' | 'rol'>;

@Injectable()
export class GroupServicesService implements OnModuleInit, OnModuleDestroy {
  private static readonly HOLD_MS = 30 * 60 * 1000;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(GroupServiceRequest)
    private readonly requests: Repository<GroupServiceRequest>,
    @InjectRepository(GroupServiceRequestSelection)
    private readonly selections: Repository<GroupServiceRequestSelection>,
    @InjectRepository(ServiceParticipant)
    private readonly participants: Repository<ServiceParticipant>,
    @InjectRepository(ServicePayment)
    private readonly payments: Repository<ServicePayment>,
    @InjectRepository(ServiceGroupAudit)
    private readonly auditRepository: Repository<ServiceGroupAudit>,
    @InjectRepository(Servicios)
    private readonly services: Repository<Servicios>,
    @InjectRepository(Empleadas)
    private readonly employees: Repository<Empleadas>,
    @InjectRepository(Viajes)
    private readonly trips: Repository<Viajes>,
    @InjectBot() private readonly bot: Telegraf<Context>,
    private readonly discipline: DisciplineService,
    private readonly realtime: RealtimeEventsService,
    private readonly config: ConfigService,
    private readonly liquidationSync: OfficeLiquidationSyncService,
    @Inject(forwardRef(() => ServicesService))
    private readonly servicesService: ServicesService,
    private readonly bossAssignment: GroupBossAssignmentService,
  ) {}

  onModuleInit(): void {
    this.cleanupTimer = setInterval(
      () => void this.releaseExpiredHolds(),
      60_000,
    );
    this.cleanupTimer.unref();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  async create(dto: CreateGroupRequestDto, actor: Actor) {
    if (!['jefe', 'admin'].includes(actor.rol)) {
      throw new ForbiddenException('No puedes crear solicitudes grupales');
    }
    const bossId =
      actor.rol === 'jefe'
        ? actor.id
        : await this.bossAssignment.resolve(dto.initialEmployeeId, actor.id);
    return this.createRequest(dto, bossId);
  }

  async createFromDetectedIntent(
    clientId: string,
    initialEmployeeId?: string,
    bookingSessionId?: string,
  ) {
    const bossId = await this.bossAssignment.resolve(initialEmployeeId);
    return this.createRequest(
      { clientId, initialEmployeeId, bookingSessionId },
      bossId,
    );
  }

  private async createRequest(dto: CreateGroupRequestDto, bossId: string) {
    const client = await this.dataSource
      .getRepository(Clientes)
      .findOneBy({ id: dto.clientId });
    if (!client) throw new NotFoundException('Cliente no encontrado');
    await this.discipline.assertOperationallyAllowed('client', dto.clientId);

    const existing = await this.requests.findOne({
      where: {
        clientId: dto.clientId,
        status: In([
          'esperando_jefe',
          'seleccionando',
          'reservada',
          'esperando_pago',
        ]),
      },
      relations: { selections: { employee: true }, client: true, boss: true },
    });
    if (existing) return existing;

    const request = await this.requests.save(
      this.requests.create({
        clientId: dto.clientId,
        bossId,
        initialEmployeeId: dto.initialEmployeeId ?? null,
        bookingSessionId: dto.bookingSessionId ?? null,
        serviceId: null,
        status: 'esperando_jefe',
        durationHours: null,
        paymentMethod: null,
        locationLat: null,
        locationLng: null,
        locationReference: null,
        holdExpiresAt: null,
        catalogVersion: 0,
        aiActive: false,
      }),
    );
    if (dto.bookingSessionId) {
      await this.dataSource.getRepository(ConversacionesTelegram).update(
        { bookingSessionId: dto.bookingSessionId },
        { groupRequestId: request.id, iaActiva: false },
      );
    }
    await this.audit(null, request.id, bossId, 'solicitud_creada', null, {
      initialEmployeeId: dto.initialEmployeeId ?? null,
    });
    this.realtime.emitToBoss(bossId, {
      type: 'group_service_request_created',
      data: request,
    });
    return this.findOne(request.id, { id: bossId, rol: 'jefe' });
  }

  async findAll(actor: Actor) {
    await this.releaseExpiredHolds();
    return this.requests.find({
      where: actor.rol === 'admin' ? {} : { bossId: actor.id },
      relations: {
        client: true,
        boss: true,
        initialEmployee: true,
        selections: { employee: true },
        service: {
          participantes: { employee: true },
          viajes: { passengers: { employee: true } },
          pagos: true,
        },
      },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, actor: Actor) {
    await this.releaseExpiredHolds();
    const request = await this.requests.findOne({
      where: { id },
      relations: {
        client: true,
        boss: true,
        initialEmployee: true,
        selections: { employee: true },
        service: {
          cliente: true,
          participantes: { employee: { usuario: true } },
          viajes: { passengers: { employee: true }, chofer: true },
          pagos: true,
        },
      },
    });
    if (!request) throw new NotFoundException('Solicitud grupal no encontrada');
    this.assertOwner(request, actor);
    return request;
  }

  async availableEmployees(actor: Actor) {
    if (!['jefe', 'admin'].includes(actor.rol)) {
      throw new ForbiddenException('No puedes consultar candidatas');
    }
    await this.releaseExpiredHolds();
    const employees = await this.employees.find({
      where: {
        disponible: true,
        catalogoActivo: true,
        usuario: { activo: true },
      },
      relations: { usuario: true, empleadaFotos: true, jefe: true },
      order: { nombreArtistico: 'ASC' },
    });
    if (!employees.length) return [];

    const ids = employees.map((employee) => employee.id);
    const conflicts = await this.dataSource.query(
      `SELECT DISTINCT employee_id
       FROM (
         SELECT employee_id
         FROM service_participants
         WHERE employee_id = ANY($1::uuid[])
           AND status IN ('reservada','pendiente_pago','activa')
           AND (hold_expires_at IS NULL OR hold_expires_at > now())
         UNION ALL
         SELECT employee_id
         FROM group_service_request_selections
         WHERE employee_id = ANY($1::uuid[])
           AND status = 'reservada' AND expires_at > now()
         UNION ALL
         SELECT empleada_id AS employee_id
         FROM servicios
         WHERE empleada_id = ANY($1::uuid[])
           AND service_type = 'individual'
           AND estado IN ('pendiente','agendado','en_curso')
         UNION ALL
         SELECT subject_id AS employee_id
         FROM disciplinary_sanctions
         WHERE subject_id = ANY($1::uuid[])
           AND subject_type = 'employee' AND status = 'active'
           AND starts_at <= now()
           AND (type = 'permanent_ban' OR ends_at > now())
       ) conflicts`,
      [ids],
    );
    const blocked = new Set<string>(
      conflicts.map((row: { employee_id: string }) => row.employee_id),
    );
    return employees.filter((employee) => !blocked.has(employee.id));
  }

  async updateRequest(
    id: string,
    dto: UpdateGroupRequestDto,
    actor: Actor,
  ) {
    const request = await this.findRequestForMutation(id, actor);
    if (request.serviceId) {
      throw new ConflictException(
        'La solicitud ya generó un servicio; usa las acciones del servicio',
      );
    }
    const before = this.requestSnapshot(request);
    Object.assign(request, {
      ...(dto.durationHours !== undefined
        ? { durationHours: dto.durationHours }
        : {}),
      ...(dto.paymentMethod ? { paymentMethod: dto.paymentMethod } : {}),
      ...(dto.locationLat !== undefined
        ? { locationLat: dto.locationLat }
        : {}),
      ...(dto.locationLng !== undefined
        ? { locationLng: dto.locationLng }
        : {}),
      ...(dto.locationReference !== undefined
        ? { locationReference: dto.locationReference.trim() || null }
        : {}),
    });
    const saved = await this.requests.save(request);
    await this.audit(
      null,
      request.id,
      actor.id,
      'solicitud_actualizada',
      before,
      this.requestSnapshot(saved),
    );
    return this.findOne(id, actor);
  }

  async requestMessages(id: string, actor: Actor) {
    const request = await this.findOne(id, actor);
    return this.dataSource.getRepository(ConversacionesTelegram).find({
      where: { groupRequestId: request.id },
      order: { enviadoAt: 'ASC' },
    });
  }

  async sendRequestMessage(id: string, message: string, actor: Actor) {
    const request = await this.findOne(id, actor);
    if (!request.client.telegramChatId)
      throw new ConflictException(
        'El cliente no tiene un chat de Telegram disponible',
      );
    await this.bot.telegram.sendMessage(
      request.client.telegramChatId,
      message.trim(),
    );
    return this.recordRequestConversation(request, 'jefe', message.trim());
  }

  async openCatalog(id: string, actor: Actor) {
    const request = await this.findRequestForMutation(id, actor);
    if (request.serviceId)
      throw new ConflictException('La solicitud ya fue confirmada');
    request.catalogVersion += 1;
    request.status = 'seleccionando';
    await this.requests.save(request);
    await this.audit(null, id, actor.id, 'catalogo_enviado', null, {
      catalogVersion: request.catalogVersion,
    });
    const result = {
      requestId: id,
      catalogVersion: request.catalogVersion,
      employees: await this.availableEmployees(actor),
    };
    const fullRequest = await this.requests.findOne({
      where: { id },
      relations: { client: true },
    });
    if (!fullRequest?.client?.telegramChatId)
      throw new ConflictException(
        'El cliente no tiene un chat de Telegram disponible',
      );
    await this.bot.telegram.sendMessage(
      fullRequest.client.telegramChatId,
      'Selecciona las empleadas que deseas para el servicio grupal. La disponibilidad se reservará cuando confirmes la selección.',
    );
    for (const employee of result.employees) {
      const callback = `gs:${this.compactUuid(id)}:${this.compactUuid(employee.id)}:${request.catalogVersion}`;
      const caption = `${employee.nombreArtistico}\n$${Number(employee.precioBaseHora).toFixed(2)} por hora`;
      const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('Seleccionar', callback)],
      ]);
      if (employee.fotoPerfilUrl) {
        await this.bot.telegram
          .sendPhoto(fullRequest.client.telegramChatId, employee.fotoPerfilUrl, {
            caption,
            ...keyboard,
          })
          .catch(() =>
            this.bot.telegram.sendMessage(
              fullRequest.client.telegramChatId!,
              caption,
              keyboard,
            ),
          );
      } else {
        await this.bot.telegram.sendMessage(
          fullRequest.client.telegramChatId,
          caption,
          keyboard,
        );
      }
    }
    await this.bot.telegram.sendMessage(
      fullRequest.client.telegramChatId,
      'Cuando termines, confirma la selección.',
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            'Confirmar selección',
            `gsc:${this.compactUuid(id)}:${request.catalogVersion}`,
          ),
        ],
      ]),
    );
    return result;
  }

  async requestClientLocation(id: string, actor: Actor) {
    const request = await this.findOne(id, actor);
    if (!request.client.telegramChatId)
      throw new ConflictException(
        'El cliente no tiene un chat de Telegram disponible',
      );
    await this.bot.telegram.sendMessage(
      request.client.telegramChatId,
      'El jefe necesita la ubicación del servicio. Compártela usando el botón.',
      Markup.keyboard([
        [Markup.button.locationRequest('Compartir ubicación')],
      ])
        .resize()
        .oneTime(),
    );
    await this.audit(null, id, actor.id, 'ubicacion_solicitada', null, null);
    return { sent: true };
  }

  async toggleCatalogSelection(
    compactRequestId: string,
    compactEmployeeId: string,
    catalogVersion: number,
  ) {
    const requestId = this.expandUuid(compactRequestId);
    const employeeId = this.expandUuid(compactEmployeeId);
    return this.dataSource.transaction(async (manager) => {
      const request = await manager.findOneBy(GroupServiceRequest, {
        id: requestId,
      });
      if (!request || request.catalogVersion !== catalogVersion)
        throw new ConflictException('Este catálogo ya no está vigente');
      if (request.serviceId || ['cancelada', 'vencida'].includes(request.status))
        throw new ConflictException('La solicitud ya no admite cambios');
      const employee = await manager.findOne(Empleadas, {
        where: { id: employeeId },
        relations: { usuario: true },
      });
      if (
        !employee ||
        !employee.disponible ||
        !employee.catalogoActivo ||
        !employee.usuario?.activo
      )
        throw new ConflictException('La empleada ya no está disponible');
      await this.assertEmployeeFree(manager, employeeId, requestId);
      const existing = await manager.findOneBy(
        GroupServiceRequestSelection,
        { requestId, employeeId },
      );
      const selected = existing?.status !== 'seleccionada';
      await manager.upsert(
        GroupServiceRequestSelection,
        {
          requestId,
          employeeId,
          status: selected ? 'seleccionada' : 'liberada',
          selectedBy: 'cliente',
          hourlyRateSnapshot: Number(employee.precioBaseHora),
          expiresAt: new Date(Date.now() + GroupServicesService.HOLD_MS),
        },
        ['requestId', 'employeeId'],
      );
      return {
        requestId,
        employeeId,
        selected,
        employeeName: employee.nombreArtistico,
      };
    });
  }

  async confirmClientCatalog(
    compactRequestId: string,
    catalogVersion: number,
  ) {
    const requestId = this.expandUuid(compactRequestId);
    const request = await this.requests.findOneBy({ id: requestId });
    if (!request || request.catalogVersion !== catalogVersion)
      throw new ConflictException('Este catálogo ya no está vigente');
    const selected = await this.selections.find({
      where: { requestId, status: 'seleccionada' },
    });
    if (selected.length < 2)
      throw new BadRequestException('Selecciona al menos dos empleadas');
    return this.reserveSelections(requestId, {
      employeeIds: selected.map((item) => item.employeeId),
      selectedBy: 'cliente',
      catalogVersion,
    });
  }

  async findActiveRequestByClientTelegram(telegramId: string) {
    return this.requests.findOne({
      where: {
        client: { telegramChatId: telegramId },
        status: In([
          'esperando_jefe',
          'seleccionando',
          'reservada',
          'esperando_pago',
        ]),
      },
      relations: { client: true, boss: true, service: true },
      order: { createdAt: 'DESC' },
    });
  }

  async findRequestByThread(threadId: string, groupTelegramId: string) {
    return this.requests.findOne({
      where: {
        telegramThreadId: threadId,
        boss: { grupoTelegramId: groupTelegramId },
        status: In([
          'esperando_jefe',
          'seleccionando',
          'reservada',
          'esperando_pago',
          'confirmada',
        ]),
      },
      relations: { client: true, boss: true },
    });
  }

  async setTelegramThread(requestId: string, threadId: string) {
    await this.requests.update(requestId, { telegramThreadId: threadId });
  }

  async recordRequestConversation(
    request: GroupServiceRequest,
    sender: 'jefe' | 'cliente' | 'sistema',
    message: string,
  ) {
    const saved = await this.dataSource
      .getRepository(ConversacionesTelegram)
      .save({
        clienteId: request.clientId,
        servicioId: request.serviceId,
        groupRequestId: request.id,
        bookingSessionId: request.bookingSessionId,
        emisor: sender,
        mensaje: message,
        iaActiva: false,
      });
    this.realtime.emitToBoss(request.bossId, {
      type: 'group_chat_message',
      data: saved,
    });
    return saved;
  }

  async setLocationFromClient(
    requestId: string,
    latitude: number,
    longitude: number,
  ) {
    const request = await this.requests.findOneBy({ id: requestId });
    if (!request || request.serviceId) return null;
    request.locationLat = latitude;
    request.locationLng = longitude;
    await this.requests.save(request);
    await this.audit(
      null,
      requestId,
      null,
      'ubicacion_cliente_recibida',
      null,
      { latitude, longitude },
    );
    this.realtime.emitToBoss(request.bossId, {
      type: 'group_location_received',
      data: { requestId, latitude, longitude },
    });
    return request;
  }

  async reserveSelections(
    id: string,
    dto: ReserveGroupSelectionDto,
    actor?: Actor,
  ) {
    const employeeIds = [...new Set(dto.employeeIds)];
    if (employeeIds.length < 2)
      throw new BadRequestException('Selecciona al menos dos empleadas');
    const expiresAt = new Date(Date.now() + GroupServicesService.HOLD_MS);

    await this.dataSource.transaction(async (manager) => {
      const request = await manager.findOne(GroupServiceRequest, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request)
        throw new NotFoundException('Solicitud grupal no encontrada');
      if (actor) this.assertOwner(request, actor);
      if (
        dto.catalogVersion !== undefined &&
        dto.catalogVersion !== request.catalogVersion
      ) {
        throw new ConflictException(
          'El catálogo cambió; vuelve a abrirlo antes de confirmar',
        );
      }
      if (request.serviceId || ['cancelada', 'vencida'].includes(request.status))
        throw new ConflictException('La solicitud ya no admite selecciones');

      const employees = await manager
        .getRepository(Empleadas)
        .createQueryBuilder('employee')
        .leftJoinAndSelect('employee.usuario', 'user')
        .setLock('pessimistic_write')
        .where('employee.id IN (:...employeeIds)', { employeeIds })
        .getMany();
      if (employees.length !== employeeIds.length)
        throw new BadRequestException('Una o más empleadas no existen');
      for (const employee of employees) {
        if (
          !employee.disponible ||
          !employee.catalogoActivo ||
          !employee.usuario?.activo
        ) {
          throw new ConflictException(
            `${employee.nombreArtistico} ya no está disponible`,
          );
        }
        await this.assertEmployeeFree(manager, employee.id, id);
      }

      await manager.update(
        GroupServiceRequestSelection,
        {
          requestId: id,
          employeeId: Not(In(employeeIds)),
          status: In(['seleccionada', 'reservada']),
        },
        { status: 'liberada' },
      );
      for (const employee of employees) {
        await manager.upsert(
          GroupServiceRequestSelection,
          {
            requestId: id,
            employeeId: employee.id,
            status: 'reservada',
            selectedBy: dto.selectedBy ?? (actor ? 'jefe' : 'cliente'),
            hourlyRateSnapshot: Number(employee.precioBaseHora),
            expiresAt,
          },
          ['requestId', 'employeeId'],
        );
      }
      request.status = 'reservada';
      request.holdExpiresAt = expiresAt;
      await manager.save(GroupServiceRequest, request);
      await manager.save(
        ServiceGroupAudit,
        manager.create(ServiceGroupAudit, {
          requestId: id,
          serviceId: null,
          actorUserId: actor?.id ?? null,
          action: 'seleccion_reservada',
          before: null,
          after: { employeeIds, expiresAt: expiresAt.toISOString() },
          reason: null,
        }),
      );
    });
    return this.findOne(
      id,
      actor ?? { id: (await this.requests.findOneByOrFail({ id })).bossId, rol: 'jefe' },
    );
  }

  async extendHold(id: string, actor: Actor) {
    const request = await this.findRequestForMutation(id, actor);
    if (request.serviceId)
      throw new ConflictException('La solicitud ya fue confirmada');
    const expiresAt = new Date(Date.now() + GroupServicesService.HOLD_MS);
    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        GroupServiceRequestSelection,
        { requestId: id, status: 'reservada' },
        { expiresAt },
      );
      request.holdExpiresAt = expiresAt;
      if (request.status === 'vencida') request.status = 'reservada';
      await manager.save(GroupServiceRequest, request);
    });
    await this.audit(null, id, actor.id, 'reserva_extendida', null, {
      expiresAt: expiresAt.toISOString(),
    });
    return this.findOne(id, actor);
  }

  async confirmQuote(id: string, dto: ConfirmGroupQuoteDto, actor: Actor) {
    const serviceId = await this.dataSource.transaction(async (manager) => {
      const request = await manager.findOne(GroupServiceRequest, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!request)
        throw new NotFoundException('Solicitud grupal no encontrada');
      this.assertOwner(request, actor);
      if (request.serviceId)
        throw new ConflictException('La cotización ya fue confirmada');
      this.assertRequestComplete(request);

      const selections = await manager.find(GroupServiceRequestSelection, {
        where: {
          requestId: id,
          status: 'reservada',
          expiresAt: MoreThan(new Date()),
        },
        relations: { employee: true },
      });
      if (selections.length < 2)
        throw new ConflictException(
          'Se necesitan al menos dos reservas vigentes',
        );
      if (
        !selections.some(
          (selection) =>
            selection.employeeId === dto.responsibleEmployeeId,
        )
      ) {
        throw new BadRequestException(
          'La responsable debe pertenecer a la selección',
        );
      }
      this.validateTransportUnits(
        dto,
        selections.map((selection) => selection.employeeId),
      );
      for (const selection of selections) {
        await this.assertEmployeeFree(manager, selection.employeeId, id);
      }

      const setting = await manager.findOneBy(TransportSetting, { id: 1 });
      const presetLocations = await manager.find(PresetServiceLocation, {
        where: { active: true },
      });
      const presetLocation = presetLocations.find(
        (location) =>
          Math.abs(Number(location.latitude) - Number(request.locationLat)) <
            0.000001 &&
          Math.abs(Number(location.longitude) - Number(request.locationLng)) <
            0.000001,
      );
      const fee = presetLocation
        ? 0
        : Number(setting?.externalLocationFee ?? 0);
      const internalDriverPayout = presetLocation ? 60 : fee / 2;
      const vehicleCount = this.billableVehicleCount(dto.transportUnits);
      const customerTransportCharge = fee * vehicleCount;
      const responsible = selections.find(
        (item) => item.employeeId === dto.responsibleEmployeeId,
      )!;
      const requiresPayment = request.paymentMethod === 'transferencia';
      const client = await manager.findOneByOrFail(Clientes, {
        id: request.clientId,
      });

      const service = await manager.save(
        Servicios,
        manager.create(Servicios, {
          serviceType: 'grupal',
          empleadaId: responsible.employeeId,
          clienteId: request.clientId,
          jefeId: request.bossId,
          metodoPago: request.paymentMethod!,
          duracionPactadaHoras: Number(request.durationHours),
          duracionFinalHoras: null,
          ubicacionClienteLat: Number(request.locationLat),
          ubicacionClienteLng: Number(request.locationLng),
          presetLocationId: presetLocation?.id ?? null,
          locationNameSnapshot: presetLocation?.name ?? null,
          locationAddressSnapshot:
            presetLocation?.address ?? request.locationReference ?? null,
          precioBaseHoraPactado: Number(responsible.hourlyRateSnapshot),
          totalBase: 0,
          totalExtras: 0,
          totalFinal: 0,
          totalPaid: 0,
          pendingBalance: 0,
          totalTransporte: customerTransportCharge,
          customerTransportCharge,
          transportFeeSnapshot: fee,
          manualTransportAdjustment: 0,
          actualTransportCost: 0,
          estado: 'pendiente',
          estadoLiquidacion: 'cerrada',
          iaActiva: false,
          clienteTelegramId: client.telegramChatId,
        }),
      );

      const holdExpiresAt = new Date(
        Date.now() + GroupServicesService.HOLD_MS,
      );
      for (const selection of selections) {
        await manager.save(
          ServiceParticipant,
          manager.create(ServiceParticipant, {
            serviceId: service.id,
            employeeId: selection.employeeId,
            role:
              selection.employeeId === dto.responsibleEmployeeId
                ? 'responsable'
                : 'participante',
            status: requiresPayment ? 'pendiente_pago' : 'reservada',
            hourlyRateSnapshot: Number(selection.hourlyRateSnapshot),
            billableHours: Number(request.durationHours),
            confirmedSubtotal:
              Number(selection.hourlyRateSnapshot) *
              Number(request.durationHours),
            holdExpiresAt,
            joinedAt: null,
            removedAt: null,
          }),
        );
      }

      for (const unit of dto.transportUnits) {
        const provider = unit.provider === 'chofer' ? 'interno' : 'uber';
        const trip = await manager.save(
          Viajes,
          manager.create(Viajes, {
            servicioId: service.id,
            choferId: null,
            tipo: unit.direction,
            unitNumber: unit.unitNumber,
            zona: 'domicilio',
            tarifa: provider === 'interno' ? internalDriverPayout : 0,
            driverPayout: provider === 'interno' ? internalDriverPayout : 0,
            estado: provider === 'interno' ? 'notificado' : 'aceptado',
            proveedorTransporte: provider,
          }),
        );
        await manager.save(
          TripPassenger,
          unit.employeeIds.map((employeeId) =>
            manager.create(TripPassenger, { tripId: trip.id, employeeId }),
          ),
        );
      }

      await manager.update(
        GroupServiceRequestSelection,
        { requestId: id, status: 'reservada' },
        { status: 'confirmada', expiresAt: holdExpiresAt },
      );
      request.serviceId = service.id;
      request.status = requiresPayment ? 'esperando_pago' : 'confirmada';
      request.holdExpiresAt = holdExpiresAt;
      await manager.save(GroupServiceRequest, request);
      await manager.update(
        ConversacionesTelegram,
        { groupRequestId: id },
        { servicioId: service.id, iaActiva: false },
      );
      await manager.save(
        ServiceGroupAudit,
        manager.create(ServiceGroupAudit, {
          serviceId: service.id,
          requestId: id,
          actorUserId: actor.id,
          action: 'cotizacion_confirmada',
          before: null,
          after: {
            responsibleEmployeeId: dto.responsibleEmployeeId,
            employeeIds: selections.map((item) => item.employeeId),
            durationHours: request.durationHours,
            vehicleCount,
            customerTransportCharge,
          },
          reason: null,
        }),
      );
      return service.id;
    });
    this.realtime.emitToBoss(actor.id, {
      type: 'group_quote_confirmed',
      data: { requestId: id, serviceId },
    });
    const result = await this.findService(serviceId, actor);
    await this.notifyPendingTransfer(result);
    return result;
  }

  async registerPayment(
    serviceId: string,
    dto: RegisterGroupPaymentDto,
    actor: Actor,
  ) {
    await this.dataSource.transaction(async (manager) => {
      const service = await this.lockGroupService(manager, serviceId, actor);
      let receipt: PaymentReceiptValidations | null = null;
      if (dto.receiptValidationId) {
        receipt = await manager.findOneBy(PaymentReceiptValidations, {
          id: dto.receiptValidationId,
        });
        if (!receipt)
          throw new NotFoundException('Validación de comprobante no encontrada');
        if (!receipt.esComprobante || receipt.estado !== 'APROBADO') {
          throw new ConflictException('El comprobante no está aprobado');
        }
      }
      const fingerprint =
        dto.fingerprint?.trim() ||
        this.receiptFingerprint(receipt) ||
        null;
      try {
        await manager.save(
          ServicePayment,
          manager.create(ServicePayment, {
            serviceId,
            receiptValidationId: receipt?.id ?? null,
            approvedByUserId: actor.id,
            amount: dto.amount,
            status: 'aprobado',
            fingerprint,
            notes: dto.notes?.trim() || null,
          }),
        );
      } catch (error: any) {
        if (error?.code === '23505') {
          throw new ConflictException(
            'Este comprobante ya fue utilizado en otro pago',
          );
        }
        throw error;
      }
      await manager.query(
        `UPDATE servicios SET total_paid = total_paid WHERE id = $1`,
        [serviceId],
      );
      const refreshed = await manager.findOneByOrFail(Servicios, {
        id: serviceId,
      });
      if (Number(refreshed.pendingBalance) <= 0.009) {
        await this.applyPaidPendingChanges(manager, refreshed);
      }
      await manager.save(
        ServiceGroupAudit,
        manager.create(ServiceGroupAudit, {
          serviceId,
          requestId: null,
          actorUserId: actor.id,
          action: 'pago_aprobado',
          before: null,
          after: { amount: dto.amount, fingerprint },
          reason: null,
        }),
      );
    });
    const result = await this.findService(serviceId, actor);
    if (
      result.estado === 'en_curso' &&
      Number(result.pendingBalance) <= 0.009
    )
      await this.dispatchPendingTrips(result);
    await this.notifyPendingTransfer(result);
    return result;
  }

  async start(serviceId: string, actor: Actor) {
    await this.dataSource.transaction(async (manager) => {
      const service = await this.lockGroupService(manager, serviceId, actor);
      if (service.estado !== 'pendiente')
        throw new ConflictException('El servicio ya no está pendiente');
      if (
        service.metodoPago === 'transferencia' &&
        Number(service.pendingBalance) > 0.009
      ) {
        throw new ConflictException('El servicio tiene saldo pendiente');
      }
      const participants = await manager.find(ServiceParticipant, {
        where: {
          serviceId,
          status: In(['reservada', 'pendiente_pago']),
        },
      });
      if (participants.length < 2)
        throw new ConflictException('El grupo ya no tiene dos participantes');
      if (
        !participants.some(
          (participant) => participant.role === 'responsable',
        )
      )
        throw new ConflictException('El grupo no tiene responsable');

      const now = new Date();
      for (const participant of participants) {
        await this.assertEmployeeFree(manager, participant.employeeId, null, serviceId);
        participant.status = 'activa';
        participant.joinedAt = now;
        participant.holdExpiresAt = null;
      }
      await manager.save(ServiceParticipant, participants);
      await manager.update(
        Empleadas,
        { id: In(participants.map((item) => item.employeeId)) },
        { disponible: false },
      );
      service.estado = 'en_curso';
      service.horaInicioServicio = now;
      service.estadoLiquidacion = 'cerrada';
      await manager.save(Servicios, service);
      await manager.update(
        GroupServiceRequest,
        { serviceId },
        { status: 'confirmada', holdExpiresAt: null },
      );
      await manager.save(
        ServiceGroupAudit,
        manager.create(ServiceGroupAudit, {
          serviceId,
          requestId: null,
          actorUserId: actor.id,
          action: 'servicio_iniciado',
          before: null,
          after: { participantIds: participants.map((item) => item.id) },
          reason: null,
        }),
      );
    });
    const result = await this.findService(serviceId, actor);
    await this.dispatchPendingTrips(result);
    for (const participant of result.participantes) {
      this.realtime.emitToEmployee(participant.employeeId, {
        type: 'group_service_started',
        data: {
          serviceId,
          role: participant.role,
        },
      });
      this.notifyExternalBoss(result.jefeId, participant.employee);
      const chatId = participant.employee?.usuario?.telegramChatId;
      if (chatId) {
        const responsible = participant.role === 'responsable';
        await this.bot.telegram.sendMessage(
          chatId,
          responsible
            ? `Fuiste asignada como responsable de un servicio grupal con ${result.participantes.length} participantes. Puedes consultar transporte, registrar extras y finalizar el servicio.`
            : `Fuiste requerida para un servicio grupal. En este servicio únicamente puedes registrar extras de tu catálogo.`,
          Markup.inlineKeyboard([
            ...(responsible
              ? [
                  [
                    Markup.button.callback(
                      'Finalizar servicio',
                      `finalizar_servicio:${serviceId}`,
                    ),
                  ],
                ]
              : []),
            [
              Markup.button.callback(
                'Agregar extra',
                `agregar_extra_list:${serviceId}`,
              ),
            ],
          ]),
        );
      }
    }
    return result;
  }

  async addParticipant(
    serviceId: string,
    dto: AddGroupParticipantDto,
    actor: Actor,
  ) {
    await this.discipline.assertOperationallyAllowed('employee', dto.employeeId);
    const dispatchTripId = await this.dataSource.transaction(async (manager) => {
      let newInternalTripId: string | null = null;
      const service = await this.lockGroupService(manager, serviceId, actor);
      if (!['pendiente', 'en_curso'].includes(service.estado))
        throw new ConflictException('El servicio ya no admite participantes');
      if (
        service.metodoPago === 'transferencia' &&
        Number(service.pendingBalance) > 0.009
      )
        throw new ConflictException(
          'Resuelve el saldo pendiente antes de otro cambio',
        );
      const employee = await manager
        .getRepository(Empleadas)
        .createQueryBuilder('employee')
        .leftJoinAndSelect('employee.usuario', 'user')
        .setLock('pessimistic_write')
        .where('employee.id = :employeeId', { employeeId: dto.employeeId })
        .getOne();
      if (
        !employee ||
        !employee.disponible ||
        !employee.catalogoActivo ||
        !employee.usuario?.activo
      )
        throw new ConflictException('La empleada no está disponible');
      await this.assertEmployeeFree(manager, employee.id, null, serviceId);

      const existing = await manager.findOneBy(ServiceParticipant, {
        serviceId,
        employeeId: employee.id,
      });
      if (existing && existing.status !== 'cancelada')
        throw new ConflictException('La empleada ya pertenece al servicio');

      const elapsed =
        service.estado === 'en_curso' && service.horaInicioServicio
          ? (Date.now() - service.horaInicioServicio.getTime()) / 3_600_000
          : 0;
      const remainingHours = Math.max(
        0,
        Number(service.duracionPactadaHoras) - elapsed,
      );
      if (remainingHours < 0.25)
        throw new ConflictException('No quedan horas suficientes para incorporarla');
      const requiresPayment = service.metodoPago === 'transferencia';
      const holdExpiresAt = new Date(
        Date.now() + GroupServicesService.HOLD_MS,
      );
      const participant = manager.create(ServiceParticipant, {
        ...(existing ? { id: existing.id } : {}),
        serviceId,
        employeeId: employee.id,
        role: 'participante',
        status: requiresPayment
          ? 'pendiente_pago'
          : service.estado === 'en_curso'
            ? 'activa'
            : 'reservada',
        hourlyRateSnapshot: Number(employee.precioBaseHora),
        billableHours: Number(remainingHours.toFixed(2)),
        confirmedSubtotal: Number(
          (Number(employee.precioBaseHora) * remainingHours).toFixed(2),
        ),
        holdExpiresAt: requiresPayment ? holdExpiresAt : null,
        joinedAt:
          !requiresPayment && service.estado === 'en_curso'
            ? new Date()
            : null,
        removedAt: null,
      });
      await manager.save(ServiceParticipant, participant);

      if (dto.needsNewTransport) {
        const maxUnitRow = await manager
          .getRepository(Viajes)
          .createQueryBuilder('trip')
          .select('COALESCE(MAX(trip.unitNumber), 0)', 'max')
          .where('trip.servicioId = :serviceId', { serviceId })
          .andWhere('trip.tipo = :type', { type: 'ida' })
          .getRawOne<{ max: string }>();
        const unitNumber = Number(maxUnitRow?.max ?? 0) + 1;
        const provider =
          dto.transportProvider === 'uber' ? 'uber' : 'interno';
        const trip = await manager.save(
          Viajes,
          manager.create(Viajes, {
            servicioId: serviceId,
            choferId: null,
            tipo: 'ida',
            unitNumber,
            zona: 'domicilio',
            tarifa:
              provider === 'interno'
                ? service.presetLocationId
                  ? 60
                  : Number(service.transportFeeSnapshot) / 2
                : 0,
            driverPayout:
              provider === 'interno'
                ? service.presetLocationId
                  ? 60
                  : Number(service.transportFeeSnapshot) / 2
                : 0,
            estado: provider === 'interno' ? 'notificado' : 'aceptado',
            proveedorTransporte: provider,
          }),
        );
        await manager.save(
          TripPassenger,
          manager.create(TripPassenger, {
            tripId: trip.id,
            employeeId: employee.id,
          }),
        );
        if (provider === 'interno') newInternalTripId = trip.id;
        await this.recalculateTransportCharge(manager, service);
      }
      if (!requiresPayment && service.estado === 'en_curso')
        await manager.update(Empleadas, employee.id, { disponible: false });
      await manager.save(
        ServiceGroupAudit,
        manager.create(ServiceGroupAudit, {
          serviceId,
          requestId: null,
          actorUserId: actor.id,
          action: 'participante_agregada',
          before: null,
          after: {
            employeeId: employee.id,
            remainingHours: participant.billableHours,
            subtotal: participant.confirmedSubtotal,
            status: participant.status,
            needsNewTransport: Boolean(dto.needsNewTransport),
          },
          reason: null,
        }),
      );
      return newInternalTripId;
    });
    const result = await this.findService(serviceId, actor);
    if (
      dispatchTripId &&
      result.estado === 'en_curso' &&
      Number(result.pendingBalance) <= 0.009
    )
      await this.servicesService.dispatchViaje(dispatchTripId);
    await this.notifyPendingTransfer(result);
    return result;
  }

  async removeParticipant(
    serviceId: string,
    employeeId: string,
    dto: RemoveGroupParticipantDto,
    actor: Actor,
  ) {
    await this.dataSource.transaction(async (manager) => {
      const service = await this.lockGroupService(manager, serviceId, actor);
      const participant = await manager.findOneBy(ServiceParticipant, {
        serviceId,
        employeeId,
      });
      if (
        !participant ||
        ['retirada', 'cancelada'].includes(participant.status)
      )
        throw new NotFoundException('Participante activa no encontrada');
      if (participant.role === 'responsable')
        throw new ConflictException(
          'Reemplaza a la responsable antes de retirarla',
        );
      const activeCount = await manager.count(ServiceParticipant, {
        where: {
          serviceId,
          status: In(['reservada', 'pendiente_pago', 'activa']),
        },
      });
      if (activeCount <= 2)
        throw new ConflictException(
          'Un servicio grupal debe conservar al menos dos participantes',
        );
      const before = { ...participant };
      participant.status =
        service.estado === 'en_curso' ? 'retirada' : 'cancelada';
      participant.removedAt = new Date();
      participant.holdExpiresAt = null;
      await manager.save(ServiceParticipant, participant);
      const activeElsewhere = await manager.exists(ServiceParticipant, {
        where: {
          employeeId,
          serviceId: Not(serviceId),
          status: 'activa',
        },
      });
      if (!activeElsewhere)
        await manager.update(Empleadas, employeeId, { disponible: true });
      if (dto.manualTransportCharge) {
        service.manualTransportAdjustment =
          Number(service.manualTransportAdjustment) +
          Number(dto.manualTransportCharge);
        service.customerTransportCharge =
          Number(service.customerTransportCharge ?? 0) +
          Number(dto.manualTransportCharge);
        service.totalTransporte = Number(service.customerTransportCharge);
        await manager.save(Servicios, service);
      }
      await manager.save(
        ServiceGroupAudit,
        manager.create(ServiceGroupAudit, {
          serviceId,
          requestId: null,
          actorUserId: actor.id,
          action: 'participante_retirada',
          before,
          after: {
            status: participant.status,
            manualTransportCharge: dto.manualTransportCharge ?? 0,
          },
          reason: dto.reason,
        }),
      );
    });
    return this.findService(serviceId, actor);
  }

  async changeResponsible(
    serviceId: string,
    dto: ChangeGroupResponsibleDto,
    actor: Actor,
  ) {
    await this.dataSource.transaction(async (manager) => {
      const service = await this.lockGroupService(manager, serviceId, actor);
      const current = await manager.findOneByOrFail(ServiceParticipant, {
        serviceId,
        role: 'responsable',
        status: Not('cancelada'),
      });
      const next = await manager.findOneBy(ServiceParticipant, {
        serviceId,
        employeeId: dto.employeeId,
        status: In(['reservada', 'pendiente_pago', 'activa']),
      });
      if (!next)
        throw new BadRequestException(
          'La nueva responsable debe ser una participante vigente',
        );
      if (current.id === next.id) return;
      current.role = 'participante';
      await manager.save(ServiceParticipant, current);
      next.role = 'responsable';
      await manager.save(ServiceParticipant, next);
      service.empleadaId = next.employeeId;
      service.precioBaseHoraPactado = Number(next.hourlyRateSnapshot);
      await manager.save(Servicios, service);
      await manager.update(
        EmployeeCashObligation,
        { serviceId, status: 'pending' },
        { employeeId: next.employeeId },
      );
      await manager.save(
        ServiceGroupAudit,
        manager.create(ServiceGroupAudit, {
          serviceId,
          requestId: null,
          actorUserId: actor.id,
          action: 'responsable_reemplazada',
          before: { employeeId: current.employeeId },
          after: { employeeId: next.employeeId },
          reason: null,
        }),
      );
    });
    return this.findService(serviceId, actor);
  }

  async changeDuration(
    serviceId: string,
    dto: ChangeGroupDurationDto,
    actor: Actor,
  ) {
    await this.dataSource.transaction(async (manager) => {
      const service = await this.lockGroupService(manager, serviceId, actor);
      const currentHours = Number(service.duracionPactadaHoras);
      if (service.estado === 'en_curso' && dto.durationHours <= currentHours)
        throw new ConflictException(
          'Después de iniciar solamente se puede aumentar la duración',
        );
      if (service.estado !== 'en_curso' && dto.durationHours === currentHours)
        return;
      if (
        service.metodoPago === 'transferencia' &&
        Number(service.pendingBalance) > 0.009
      )
        throw new ConflictException(
          'Resuelve el saldo pendiente antes de otro cambio',
        );
      const delta = dto.durationHours - currentHours;
      const statuses =
        service.estado === 'en_curso'
          ? ['activa']
          : ['reservada', 'pendiente_pago'];
      const participants = await manager.find(ServiceParticipant, {
        where: { serviceId, status: In(statuses) },
      });
      for (const participant of participants) {
        participant.billableHours = Number(
          (Number(participant.billableHours) + delta).toFixed(2),
        );
        participant.confirmedSubtotal = Number(
          (
            Number(participant.confirmedSubtotal) +
            Number(participant.hourlyRateSnapshot) * delta
          ).toFixed(2),
        );
      }
      await manager.save(ServiceParticipant, participants);
      if (
        service.estado === 'en_curso' &&
        service.metodoPago === 'transferencia'
      ) {
        service.pendingDurationHours = dto.durationHours;
      } else {
        service.duracionPactadaHoras = dto.durationHours;
        service.pendingDurationHours = null;
      }
      await manager.save(Servicios, service);
      await manager.save(
        ServiceGroupAudit,
        manager.create(ServiceGroupAudit, {
          serviceId,
          requestId: null,
          actorUserId: actor.id,
          action: 'duracion_modificada',
          before: { durationHours: currentHours },
          after: {
            durationHours: dto.durationHours,
            pendingPayment: Boolean(service.pendingDurationHours),
          },
          reason: null,
        }),
      );
    });
    const result = await this.findService(serviceId, actor);
    await this.notifyPendingTransfer(result);
    return result;
  }

  async configureTransports(
    serviceId: string,
    dto: ConfigureGroupTransportDto,
    actor: Actor,
  ) {
    const dispatchTripIds = await this.dataSource.transaction(
      async (manager) => {
        const service = await this.lockGroupService(manager, serviceId, actor);
        if (!['pendiente', 'en_curso'].includes(service.estado))
          throw new ConflictException(
            'El servicio ya no admite cambios de transporte',
          );

        const activeParticipants = await manager.find(ServiceParticipant, {
          where: {
            serviceId,
            status: In(['reservada', 'pendiente_pago', 'activa']),
          },
        });
        const employeeIds = activeParticipants.map((item) => item.employeeId);
        this.validateTransportConfiguration(dto.transportUnits, employeeIds);

        const configuredDirections = [
          ...new Set(dto.transportUnits.map((unit) => unit.direction)),
        ];
        const existingTrips = await manager.find(Viajes, {
          where: {
            servicioId: serviceId,
            tipo: In(configuredDirections),
          },
          relations: { passengers: true },
          lock: { mode: 'pessimistic_write' },
        });
        const requestedKeys = new Set(
          dto.transportUnits.map(
            (unit) => `${unit.direction}:${unit.unitNumber}`,
          ),
        );
        const immutableStates = new Set([
          'en_camino',
          'llegado',
          'en_curso',
          'finalizado',
        ]);
        const dispatchIds: string[] = [];

        for (const trip of existingTrips) {
          const key = `${trip.tipo}:${trip.unitNumber}`;
          if (requestedKeys.has(key)) continue;
          if (immutableStates.has(trip.estado))
            throw new ConflictException(
              `La unidad ${key} ya está operando y no puede eliminarse`,
            );
          trip.estado = 'cancelado';
          await manager.save(Viajes, trip);
        }

        for (const unit of dto.transportUnits) {
          const provider = unit.provider === 'chofer' ? 'interno' : 'uber';
          let trip = existingTrips.find(
            (item) =>
              item.tipo === unit.direction &&
              item.unitNumber === unit.unitNumber,
          );
          if (trip && immutableStates.has(trip.estado)) {
            const currentPassengerIds = (trip.passengers ?? [])
              .map((item) => item.employeeId)
              .sort();
            const nextPassengerIds = [...unit.employeeIds].sort();
            if (
              trip.proveedorTransporte !== provider ||
              currentPassengerIds.join(',') !== nextPassengerIds.join(',')
            )
              throw new ConflictException(
                `La unidad ${unit.direction}:${unit.unitNumber} ya está operando`,
              );
            continue;
          }
          trip = await manager.save(
            Viajes,
            manager.create(Viajes, {
              ...(trip ? { id: trip.id } : {}),
              servicioId: serviceId,
              choferId: null,
              tipo: unit.direction,
              unitNumber: unit.unitNumber,
              zona: 'domicilio',
              tarifa:
                provider === 'interno'
                  ? service.presetLocationId
                    ? 60
                    : Number(service.transportFeeSnapshot) / 2
                  : 0,
              driverPayout:
                provider === 'interno'
                  ? service.presetLocationId
                    ? 60
                    : Number(service.transportFeeSnapshot) / 2
                  : 0,
              estado: provider === 'interno' ? 'notificado' : 'aceptado',
              proveedorTransporte: provider,
            }),
          );
          await manager.delete(TripPassenger, { tripId: trip.id });
          await manager.save(
            TripPassenger,
            unit.employeeIds.map((employeeId) =>
              manager.create(TripPassenger, {
                tripId: trip!.id,
                employeeId,
              }),
            ),
          );
          if (provider === 'interno') dispatchIds.push(trip.id);
        }

        await this.recalculateTransportCharge(manager, service);
        await manager.save(
          ServiceGroupAudit,
          manager.create(ServiceGroupAudit, {
            serviceId,
            requestId: null,
            actorUserId: actor.id,
            action: 'transportes_configurados',
            before: {
              units: existingTrips.map((trip) => ({
                id: trip.id,
                direction: trip.tipo,
                unitNumber: trip.unitNumber,
                provider: trip.proveedorTransporte,
                employeeIds: trip.passengers?.map((item) => item.employeeId),
              })),
            },
            after: { units: dto.transportUnits },
            reason: null,
          }),
        );
        return dispatchIds;
      },
    );

    const result = await this.findService(serviceId, actor);
    if (
      result.estado === 'en_curso' &&
      Number(result.pendingBalance) <= 0.009
    )
      await Promise.all(
        dispatchTripIds.map((tripId) =>
          this.servicesService.dispatchViaje(tripId),
        ),
      );
    await this.notifyPendingTransfer(result);
    return result;
  }

  async addManualTransportCharge(
    serviceId: string,
    dto: ManualTransportChargeDto,
    actor: Actor,
  ) {
    await this.dataSource.transaction(async (manager) => {
      const service = await this.lockGroupService(manager, serviceId, actor);
      const before = Number(service.customerTransportCharge ?? 0);
      service.manualTransportAdjustment =
        Number(service.manualTransportAdjustment) + dto.amount;
      service.customerTransportCharge = before + dto.amount;
      service.totalTransporte = Number(service.customerTransportCharge);
      await manager.save(Servicios, service);
      await manager.save(
        ServiceGroupAudit,
        manager.create(ServiceGroupAudit, {
          serviceId,
          requestId: null,
          actorUserId: actor.id,
          action: 'cargo_transporte_manual',
          before: { customerTransportCharge: before },
          after: {
            customerTransportCharge: service.customerTransportCharge,
            amount: dto.amount,
          },
          reason: dto.reason,
        }),
      );
    });
    const result = await this.findService(serviceId, actor);
    await this.notifyPendingTransfer(result);
    return result;
  }

  async cancelRequest(id: string, actor: Actor) {
    const request = await this.findRequestForMutation(id, actor);
    if (request.serviceId)
      throw new ConflictException(
        'Cancela el servicio desde el flujo operativo',
      );
    await this.dataSource.transaction(async (manager) => {
      request.status = 'cancelada';
      request.holdExpiresAt = null;
      await manager.save(GroupServiceRequest, request);
      await manager.update(
        GroupServiceRequestSelection,
        { requestId: id, status: 'reservada' },
        { status: 'liberada' },
      );
    });
    await this.audit(null, id, actor.id, 'solicitud_cancelada', null, null);
    return { cancelled: true };
  }

  async findService(serviceId: string, actor: Actor) {
    const service = await this.services.findOne({
      where: { id: serviceId },
      relations: {
        cliente: true,
        jefe: true,
        empleada: true,
        participantes: { employee: { usuario: true, jefe: true } },
        viajes: { passengers: { employee: true }, chofer: true },
        pagos: { receiptValidation: true },
        extrasServicios: { extraCatalogo: true, participant: true },
      },
    });
    if (!service || service.serviceType !== 'grupal')
      throw new NotFoundException('Servicio grupal no encontrado');
    if (actor.rol !== 'admin' && service.jefeId !== actor.id)
      throw new ForbiddenException('No puedes gestionar este servicio grupal');
    return service;
  }

  async participantAccess(
    serviceId: string,
    telegramId: string,
  ): Promise<{ participant: ServiceParticipant; responsible: boolean } | null> {
    const participant = await this.participants.findOne({
      where: {
        serviceId,
        status: In(['activa', 'reservada', 'pendiente_pago']),
        employee: { usuario: { telegramChatId: telegramId } },
      },
      relations: { employee: { usuario: true } },
    });
    return participant
      ? { participant, responsible: participant.role === 'responsable' }
      : null;
  }

  async finishByResponsible(serviceId: string, telegramId: string) {
    const access = await this.participantAccess(serviceId, telegramId);
    if (!access?.responsible)
      throw new ForbiddenException(
        'Solamente la responsable puede finalizar el servicio',
      );
    await this.dataSource.transaction(async (manager) => {
      const service = await manager.findOne(Servicios, {
        where: { id: serviceId, serviceType: 'grupal' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!service)
        throw new NotFoundException('Servicio grupal no encontrado');
      if (service.estado !== 'en_curso')
        throw new ConflictException('El servicio ya no está activo');
      if (
        service.metodoPago === 'transferencia' &&
        Number(service.pendingBalance) > 0.009
      )
        throw new ConflictException(
          'No se puede finalizar mientras exista saldo pendiente',
        );
      const now = new Date();
      service.estado = 'finalizado';
      service.horaFinServicio = now;
      service.duracionFinalHoras = service.horaInicioServicio
        ? Number(
            (
              (now.getTime() - service.horaInicioServicio.getTime()) /
              3_600_000
            ).toFixed(2),
          )
        : Number(service.duracionPactadaHoras);
      service.estadoLiquidacion = 'transporte_pendiente';
      service.recordatoriosRegreso = 0;
      service.proximoRecordatorioRegresoAt = new Date(
        Date.now() + 5 * 60_000,
      );
      await manager.save(Servicios, service);

      const active = await manager.find(ServiceParticipant, {
        where: { serviceId, status: 'activa' },
      });
      const pending = await manager.find(ServiceParticipant, {
        where: {
          serviceId,
          status: In(['reservada', 'pendiente_pago']),
        },
      });
      for (const participant of active) {
        participant.status = 'retirada';
        participant.removedAt = now;
      }
      for (const participant of pending) {
        participant.status = 'cancelada';
        participant.removedAt = now;
      }
      await manager.save(ServiceParticipant, [...active, ...pending]);
      const employeeIds = active.map((item) => item.employeeId);
      for (const employeeId of employeeIds) {
        const otherActive = await manager.exists(ServiceParticipant, {
          where: {
            employeeId,
            serviceId: Not(serviceId),
            status: 'activa',
          },
        });
        if (!otherActive)
          await manager.update(Empleadas, employeeId, { disponible: true });
      }
      await manager.save(
        ServiceGroupAudit,
        manager.create(ServiceGroupAudit, {
          serviceId,
          requestId: null,
          actorUserId: access.participant.employee.usuarioId,
          action: 'servicio_finalizado',
          before: null,
          after: {
            durationFinalHours: service.duracionFinalHoras,
            totalFinal: service.totalFinal,
          },
          reason: null,
        }),
      );
    });
    await this.liquidationSync.syncOfficeRecord(serviceId);
    return this.services.findOne({
      where: { id: serviceId },
      relations: {
        cliente: true,
        participantes: { employee: true },
        viajes: true,
        extrasServicios: { extraCatalogo: true, participant: true },
      },
    });
  }

  private async findRequestForMutation(id: string, actor: Actor) {
    const request = await this.requests.findOneBy({ id });
    if (!request) throw new NotFoundException('Solicitud grupal no encontrada');
    this.assertOwner(request, actor);
    if (['cancelada', 'vencida'].includes(request.status))
      throw new ConflictException('La solicitud ya no está activa');
    return request;
  }

  private assertOwner(request: GroupServiceRequest, actor: Actor): void {
    if (actor.rol !== 'admin' && request.bossId !== actor.id)
      throw new ForbiddenException('No puedes gestionar esta solicitud');
  }

  private async assertEmployeeFree(
    manager: EntityManager,
    employeeId: string,
    requestId?: string | null,
    serviceId?: string,
  ) {
    const participantConflict = await manager
      .getRepository(ServiceParticipant)
      .createQueryBuilder('participant')
      .where('participant.employeeId = :employeeId', { employeeId })
      .andWhere('participant.status IN (:...statuses)', {
        statuses: ['reservada', 'pendiente_pago', 'activa'],
      })
      .andWhere(
        '(participant.holdExpiresAt IS NULL OR participant.holdExpiresAt > :now)',
        { now: new Date() },
      )
      .andWhere(
        serviceId ? 'participant.serviceId <> :serviceId' : '1 = 1',
        serviceId ? { serviceId } : {},
      )
      .getExists();
    if (participantConflict)
      throw new ConflictException('La empleada ya está reservada');

    const selectionQb = manager
      .getRepository(GroupServiceRequestSelection)
      .createQueryBuilder('selection')
      .where('selection.employeeId = :employeeId', { employeeId })
      .andWhere('selection.status = :status', { status: 'reservada' })
      .andWhere('selection.expiresAt > :now', { now: new Date() });
    if (requestId)
      selectionQb.andWhere('selection.requestId <> :requestId', { requestId });
    if (await selectionQb.getExists())
      throw new ConflictException('La empleada ya está reservada');

    const legacyConflict = await manager.findOne(Servicios, {
      where: {
        empleadaId: employeeId,
        serviceType: 'individual',
        estado: In(['pendiente', 'agendado', 'en_curso']),
      },
    });
    if (legacyConflict)
      throw new ConflictException('La empleada tiene otro servicio vigente');
  }

  private assertRequestComplete(request: GroupServiceRequest): void {
    if (
      !request.durationHours ||
      !request.paymentMethod ||
      request.locationLat === null ||
      request.locationLng === null
    )
      throw new BadRequestException(
        'Completa duración, pago y ubicación antes de cotizar',
      );
  }

  private validateTransportUnits(
    dto: ConfirmGroupQuoteDto,
    employeeIds: string[],
  ) {
    if (!dto.transportUnits.length)
      throw new BadRequestException('Configura al menos una unidad de ida');
    const keys = new Set<string>();
    for (const unit of dto.transportUnits) {
      const key = `${unit.direction}:${unit.unitNumber}`;
      if (keys.has(key))
        throw new BadRequestException('Hay unidades de transporte duplicadas');
      keys.add(key);
      for (const employeeId of unit.employeeIds) {
        if (!employeeIds.includes(employeeId))
          throw new BadRequestException(
            'Una pasajera no pertenece a la selección',
          );
      }
    }
    const outbound = new Set(
      dto.transportUnits
        .filter((unit) => unit.direction === 'ida')
        .flatMap((unit) => unit.employeeIds),
    );
    if (employeeIds.some((id) => !outbound.has(id)))
      throw new BadRequestException(
        'Todas las participantes deben tener transporte de ida',
      );
  }

  private validateTransportConfiguration(
    units: ConfigureGroupTransportDto['transportUnits'],
    employeeIds: string[],
  ) {
    const keys = new Set<string>();
    const passengersByDirection = new Map<string, Set<string>>();
    for (const unit of units) {
      const key = `${unit.direction}:${unit.unitNumber}`;
      if (keys.has(key))
        throw new BadRequestException('Hay unidades de transporte duplicadas');
      keys.add(key);
      const assigned =
        passengersByDirection.get(unit.direction) ?? new Set<string>();
      for (const employeeId of unit.employeeIds) {
        if (!employeeIds.includes(employeeId))
          throw new BadRequestException(
            'Una pasajera no pertenece a la plantilla activa',
          );
        if (assigned.has(employeeId))
          throw new BadRequestException(
            'Una empleada no puede viajar en dos unidades del mismo sentido',
          );
        assigned.add(employeeId);
      }
      passengersByDirection.set(unit.direction, assigned);
    }
    for (const [direction, assigned] of passengersByDirection) {
      if (employeeIds.some((id) => !assigned.has(id)))
        throw new BadRequestException(
          `Todas las participantes deben tener transporte de ${direction}`,
        );
    }
  }

  private billableVehicleCount(
    units: ConfirmGroupQuoteDto['transportUnits'],
  ): number {
    const outbound = new Set(
      units
        .filter((unit) => unit.direction === 'ida')
        .map((unit) => unit.unitNumber),
    ).size;
    const returns = new Set(
      units
        .filter((unit) => unit.direction === 'regreso')
        .map((unit) => unit.unitNumber),
    ).size;
    return Math.max(outbound, returns);
  }

  private async recalculateTransportCharge(
    manager: EntityManager,
    service: Servicios,
  ) {
    const rows: Array<{ tipo: string; count: string }> = await manager.query(
      `SELECT tipo, COUNT(*)::text AS count
       FROM viajes
       WHERE servicio_id = $1 AND estado NOT IN ('cancelado','rechazado')
       GROUP BY tipo`,
      [service.id],
    );
    const ordinaryUnits = Math.max(
      ...rows.map((row) => Number(row.count)),
      0,
    );
    service.customerTransportCharge =
      Number(service.transportFeeSnapshot) * ordinaryUnits +
      Number(service.manualTransportAdjustment);
    service.totalTransporte = Number(service.customerTransportCharge);
    await manager.save(Servicios, service);
  }

  private async lockGroupService(
    manager: EntityManager,
    serviceId: string,
    actor: Actor,
  ) {
    const service = await manager.findOne(Servicios, {
      where: { id: serviceId, serviceType: 'grupal' },
      lock: { mode: 'pessimistic_write' },
    });
    if (!service) throw new NotFoundException('Servicio grupal no encontrado');
    if (actor.rol !== 'admin' && service.jefeId !== actor.id)
      throw new ForbiddenException('No puedes gestionar este servicio');
    return service;
  }

  private receiptFingerprint(receipt: PaymentReceiptValidations | null) {
    if (!receipt) return null;
    const value = receipt.idSpei || receipt.folio || receipt.referencia;
    return value
      ? `${receipt.bancoOrigen ?? 'banco'}:${value}`.toLowerCase().trim()
      : null;
  }

  private async dispatchPendingTrips(service: Servicios) {
    await Promise.all(
      (service.viajes ?? [])
        .filter(
          (trip) =>
            trip.proveedorTransporte === 'interno' &&
            trip.estado === 'notificado',
        )
        .map((trip) => this.servicesService.dispatchViaje(trip.id)),
    );
  }

  private async applyPaidPendingChanges(
    manager: EntityManager,
    service: Servicios,
  ) {
    if (service.pendingDurationHours) {
      service.duracionPactadaHoras = Number(service.pendingDurationHours);
      service.pendingDurationHours = null;
      await manager.save(Servicios, service);
    }
    const pending = await manager.find(ServiceParticipant, {
      where: { serviceId: service.id, status: 'pendiente_pago' },
    });
    for (const participant of pending) {
      participant.status =
        service.estado === 'en_curso' ? 'activa' : 'reservada';
      participant.holdExpiresAt = null;
      if (service.estado === 'en_curso') {
        participant.joinedAt = new Date();
        await manager.update(Empleadas, participant.employeeId, {
          disponible: false,
        });
      }
    }
    if (pending.length) await manager.save(ServiceParticipant, pending);
    await manager.update(
      GroupServiceRequest,
      { serviceId: service.id },
      { status: 'confirmada', holdExpiresAt: null },
    );
  }

  private notifyExternalBoss(organizerBossId: string, employee?: Empleadas) {
    if (employee?.jefeId && employee.jefeId !== organizerBossId) {
      this.realtime.emitToBoss(employee.jefeId, {
        type: 'external_employee_group_assignment',
        data: { employeeId: employee.id, organizerBossId },
      });
    }
  }

  private requestSnapshot(request: GroupServiceRequest) {
    return {
      durationHours: request.durationHours,
      paymentMethod: request.paymentMethod,
      locationLat: request.locationLat,
      locationLng: request.locationLng,
      locationReference: request.locationReference,
    };
  }

  private async notifyPendingTransfer(service: Servicios) {
    if (
      service.metodoPago !== 'transferencia' ||
      Number(service.pendingBalance) <= 0.009 ||
      !service.cliente?.telegramChatId
    )
      return;
    const bankDetails =
      this.config.get<string>('BANK_ACCOUNT_DETAILS') ||
      'Consulta con el jefe los datos bancarios autorizados.';
    await this.bot.telegram.sendMessage(
      service.cliente.telegramChatId,
      `Cotización del servicio grupal\nTotal: $${Number(service.totalFinal).toFixed(2)}\nPagado: $${Number(service.totalPaid).toFixed(2)}\nSaldo por transferir: $${Number(service.pendingBalance).toFixed(2)}\n\n${bankDetails}\n\nEnvía una foto del comprobante en este chat. El servicio o incremento se activará después de validarlo.`,
    );
  }

  private compactUuid(uuid: string): string {
    return Buffer.from(uuid.replace(/-/g, ''), 'hex').toString('base64url');
  }

  private expandUuid(compact: string): string {
    const hex = Buffer.from(compact, 'base64url').toString('hex');
    if (hex.length !== 32)
      throw new BadRequestException('Identificador de catálogo inválido');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  private async audit(
    serviceId: string | null,
    requestId: string | null,
    actorUserId: string | null,
    action: string,
    before: Record<string, unknown> | null,
    after: Record<string, unknown> | null,
    reason?: string,
  ) {
    await this.auditRepository.save(
      this.auditRepository.create({
        serviceId,
        requestId,
        actorUserId,
        action,
        before,
        after,
        reason: reason ?? null,
      }),
    );
  }

  private async releaseExpiredHolds() {
    const expired = await this.requests.find({
      where: {
        holdExpiresAt: MoreThan(new Date(0)),
        status: In(['seleccionando', 'reservada', 'esperando_pago']),
      },
    });
    const now = new Date();
    for (const request of expired.filter(
      (item) => item.holdExpiresAt && item.holdExpiresAt <= now,
    )) {
      if (request.serviceId) {
        const service = await this.services.findOneBy({
          id: request.serviceId,
        });
        if (service?.estado === 'pendiente' && Number(service.totalPaid) === 0) {
          await this.participants.update(
            {
              serviceId: service.id,
              status: In(['reservada', 'pendiente_pago']),
            },
            { status: 'cancelada', holdExpiresAt: null },
          );
          service.estado = 'cancelado';
          await this.services.save(service);
        }
      }
      await this.selections.update(
        { requestId: request.id, status: 'reservada' },
        { status: 'liberada' },
      );
      request.status = 'vencida';
      request.holdExpiresAt = null;
      await this.requests.save(request);
      this.realtime.emitToBoss(request.bossId, {
        type: 'group_service_hold_expired',
        data: { requestId: request.id, serviceId: request.serviceId },
      });
    }
  }
}
