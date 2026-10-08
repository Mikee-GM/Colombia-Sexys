import {
  BadRequestException,
  ConflictException,
  INestApplication,
  RequestMethod,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { createHmac } from 'crypto';
import { getBotToken } from 'nestjs-telegraf';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AiMessageService } from '../src/ai/ai-message.service';
import { AuthService } from '../src/auth/auth.service';
import { DriverTripsService } from '../src/drivers/driver-trips.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { RealtimeBus } from '../src/realtime/realtime.bus';
import { RealtimeEventsService } from '../src/realtime/realtime.service';
import { Servicios } from '../src/services/entities/service.entity';
import { ServiceOperationEvent } from '../src/services/operations/entities/service-operation-event.entity';
import {
  SERVICE_OPERATION_ACTIONS,
  SERVICE_OPERATION_STATES,
  employeeOperationActions,
} from '../src/services/operations/service-operation-state';
import { ServicesService } from '../src/services/services.service';
import { TelegramConversationsService } from '../src/telegram-conversations/telegram-conversations.service';
import { TelegramBookingUpdate } from '../src/telegram/telegram-booking.update';
import { parseTelegramStartPayload } from '../src/telegram/telegram-start-payload';
import { TelegramService } from '../src/telegram/telegram.service';
import { Usuarios } from '../src/users/entities/user.entity';
import { CreateServiceOperationsCore1810000000000 } from '../src/migrations/1810000000000-CreateServiceOperationsCore';

const IDS = {
  boss: '11111111-1111-4111-8111-111111111111',
  otherBoss: '11111111-1111-4111-8111-222222222222',
  employeeUser: '22222222-2222-4222-8222-222222222222',
  otherEmployeeUser: '22222222-2222-4222-8222-333333333333',
  employee: '33333333-3333-4333-8333-333333333333',
  otherEmployee: '33333333-3333-4333-8333-444444444444',
  client: '44444444-4444-4444-8444-444444444444',
  driverUser: '55555555-5555-4555-8555-555555555555',
  driver: '66666666-6666-4666-8666-666666666666',
  service: '77777777-7777-4777-8777-777777777777',
  extra: '88888888-8888-4888-8888-888888888888',
  timerService: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  draftService: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  booking: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  otherBooking: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
} as const;

const telegramMethods = new Map<PropertyKey, jest.Mock>();
const telegram = new Proxy<Record<PropertyKey, jest.Mock>>(
  {},
  {
    get: (_target, property) => {
      let method = telegramMethods.get(property);
      if (!method) {
        method = jest.fn().mockResolvedValue({ message_id: 101 });
        telegramMethods.set(property, method);
      }
      return method;
    },
  },
);
const botMethods = new Map<PropertyKey, jest.Mock>();
const bot = new Proxy<Record<PropertyKey, unknown>>(
  { telegram },
  {
    get: (target, property) => {
      // Evita que `await` interprete el doble como una Promise pendiente.
      if (property === 'then') return undefined;
      if (property in target) return target[property];
      let method = botMethods.get(property);
      if (!method) {
        method = jest.fn();
        botMethods.set(property, method);
      }
      return method;
    },
  },
);

const notifications = {
  notificar: jest.fn((_userId: string, message: { titulo: string }) => {
    if (message.titulo === 'EMERGENCIA EN SERVICIO') {
      return Promise.reject(
        new Error('push E2E intencionalmente no disponible'),
      );
    }
    return Promise.resolve();
  }),
  notificarJefeServicioPendiente: jest.fn().mockResolvedValue(undefined),
};
const aiMessages = {
  generate: jest.fn((_event: string, _context: unknown, fallback: string) =>
    Promise.resolve(fallback),
  ),
  generateAgencyMessage: jest.fn(
    (_event: string, _context: unknown, fallback: string) =>
      Promise.resolve(fallback),
  ),
};
const telegramAdapter = {
  sendMessage: jest.fn().mockResolvedValue({ message_id: 102 }),
  deleteMessage: jest.fn().mockResolvedValue(undefined),
  deleteForumTopic: jest.fn().mockResolvedValue(undefined),
};
const realtime = {
  emitToBoss: jest.fn(),
  emitToBosses: jest.fn(),
  emitToEmployee: jest.fn(),
  emitToDriver: jest.fn(),
  emitToClient: jest.fn(),
  emitToJefes: jest.fn(),
  onLocalDispatch: jest.fn(),
};

describe('flujo operativo integrado (PostgreSQL)', () => {
  let moduleFixture: TestingModule | undefined;
  let app: INestApplication | undefined;
  let dataSource: DataSource;
  let auth: AuthService;
  let services: ServicesService;
  let driverTrips: DriverTripsService;
  let conversations: TelegramConversationsService;
  let bookingUpdate: TelegramBookingUpdate;

  beforeAll(async () => {
    moduleFixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(getBotToken())
      .useValue(bot)
      .overrideProvider(NotificationsService)
      .useValue(notifications)
      .overrideProvider(AiMessageService)
      .useValue(aiMessages)
      .overrideProvider(TelegramService)
      .useValue(telegramAdapter)
      .overrideProvider(RealtimeBus)
      .useValue({
        onRemoteMessage: jest.fn(),
        publish: jest.fn().mockResolvedValue(undefined),
      })
      .overrideProvider(RealtimeEventsService)
      .useValue(realtime)
      .compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser(process.env.COOKIE_SECRET));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api', {
      exclude: [
        { path: 'health/live', method: RequestMethod.GET },
        { path: 'health/ready', method: RequestMethod.GET },
      ],
    });
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    await app.init();

    dataSource = moduleFixture.get(DataSource);
    auth = moduleFixture.get(AuthService);
    services = moduleFixture.get(ServicesService);
    driverTrips = moduleFixture.get(DriverTripsService);
    conversations = moduleFixture.get(TelegramConversationsService);
    bookingUpdate = moduleFixture.get(TelegramBookingUpdate);
  });

  afterAll(async () => {
    if (app) await app.close();
    else if (moduleFixture) await moduleFixture.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    await seedBase();
  });

  async function seedBase() {
    // Esta base vive en un contenedor efímero creado por run-e2e.mjs.
    await dataSource.query(
      'TRUNCATE TABLE "usuarios", "clientes", "telegram_sessions" CASCADE',
    );
    await dataSource.query(
      `INSERT INTO "usuarios"
        (id, email, password_hash, rol, nombre, telegram_chat_id, activo, disponible, en_jornada)
       VALUES
        ($1, 'jefe-e2e@example.com', 'hash', 'jefe', 'Jefe E2E', NULL, true, true, true),
        ($2, 'otro-jefe-e2e@example.com', 'hash', 'jefe', 'Otro Jefe E2E', NULL, true, true, true),
        ($3, 'empleada-e2e@example.com', 'hash', 'empleada', 'Empleada E2E', NULL, true, true, true),
        ($4, 'otra-empleada-e2e@example.com', 'hash', 'empleada', 'Otra Empleada E2E', NULL, true, true, true),
        ($5, 'chofer-e2e@example.com', 'hash', 'chofer', 'Chofer E2E', 9003, true, true, true)`,
      [
        IDS.boss,
        IDS.otherBoss,
        IDS.employeeUser,
        IDS.otherEmployeeUser,
        IDS.driverUser,
      ],
    );
    await dataSource.query(
      `INSERT INTO "empleadas"
        (id, usuario_id, nombre_real, nombre_artistico, slug_catalogo,
         precio_base_hora, disponible, catalogo_activo, ubicacion_lat,
         ubicacion_lng, ultima_ubicacion_at, jefe_id, modo_bot)
       VALUES
        ($1, $2, 'Empleada E2E', 'Luna E2E', 'luna-e2e', 200,
         true, true, 4.7109000, -74.0721000, now(), $3, false),
        ($4, $5, 'Otra Empleada E2E', 'Sol E2E', 'sol-e2e', 220,
         true, true, 4.7209000, -74.0821000, now(), $6, false)`,
      [
        IDS.employee,
        IDS.employeeUser,
        IDS.boss,
        IDS.otherEmployee,
        IDS.otherEmployeeUser,
        IDS.otherBoss,
      ],
    );
    await dataSource.query(
      `INSERT INTO "clientes" (id, telegram_chat_id, nombre_telegram)
       VALUES ($1, 9001, 'Cliente E2E')`,
      [IDS.client],
    );
    await dataSource.query(
      `INSERT INTO "choferes"
        (id, usuario_id, nombre, telefono, disponible, ubicacion_lat,
         ubicacion_lng, ultima_ubicacion_at, modo_bot, vehiculo_marca,
         vehiculo_modelo, vehiculo_color, vehiculo_placa)
       VALUES ($1, $2, 'Chofer E2E', '3000000000', true, 4.7110000,
               -74.0720000, now(), true, 'Nissan', 'Versa', 'Negro',
               'E2E-123')`,
      [IDS.driver, IDS.driverUser],
    );
    await insertService(IDS.service, 'preparacion');
    await dataSource.query(
      `INSERT INTO "extras_catalogo" (id, empleada_id, nombre, precio, activo)
       VALUES ($1, $2, 'Extra E2E', 75, true)`,
      [IDS.extra, IDS.employee],
    );
  }

  async function insertService(id: string, operationalState: string) {
    await dataSource.query(
      `INSERT INTO "servicios"
        (id, empleada_id, cliente_id, jefe_id, metodo_pago,
         duracion_pactada_horas, ubicacion_cliente_lat,
         ubicacion_cliente_lng, precio_base_hora_pactado, estado,
         estado_operativo, location_name_snapshot, location_address_snapshot)
       VALUES ($1, $2, $3, $4, 'efectivo', 1, 4.7115000, -74.0715000,
               200, 'pendiente', $5, 'Lugar E2E', 'Dirección E2E')`,
      [id, IDS.employee, IDS.client, IDS.boss, operationalState],
    );
  }

  async function service(id: string = IDS.service) {
    return dataSource.getRepository(Servicios).findOneByOrFail({ id });
  }

  async function eventTypes(id: string = IDS.service) {
    const rows = await dataSource.getRepository(ServiceOperationEvent).find({
      where: { serviceId: id },
      order: { occurredAt: 'ASC' },
    });
    return rows.map((row) => row.type);
  }

  async function accessToken(userId: string): Promise<string> {
    const user = await dataSource
      .getRepository(Usuarios)
      .findOneByOrFail({ id: userId });
    return (await auth.issueSessionFor(user, 'e2e-http')).accessToken;
  }

  function signedCookie(name: string, value: string): string {
    const secret = process.env.COOKIE_SECRET as string;
    const signature = createHmac('sha256', secret)
      .update(value)
      .digest('base64')
      .replace(/=+$/, '');
    return `${name}=${encodeURIComponent(`s:${value}.${signature}`)}`;
  }

  it('aplica, revierte y reaplica la migración sin perder el servicio legado', async () => {
    await dataSource.query(
      `UPDATE "servicios"
          SET estado = 'en_curso', estado_operativo = 'en_curso', notas = 'preservar-e2e'
        WHERE id = $1`,
      [IDS.service],
    );
    const runner = dataSource.createQueryRunner();
    await runner.connect();
    const migration = new CreateServiceOperationsCore1810000000000();
    try {
      await migration.down(runner);
      const [legacy] = await runner.query(
        `SELECT id, estado, notas FROM "servicios" WHERE id = $1`,
        [IDS.service],
      );
      expect(legacy).toMatchObject({
        id: IDS.service,
        estado: 'en_curso',
        notas: 'preservar-e2e',
      });
      await migration.up(runner);
      const [restored] = await runner.query(
        `SELECT estado_operativo, notas FROM "servicios" WHERE id = $1`,
        [IDS.service],
      );
      expect(restored).toEqual({
        estado_operativo: 'en_curso',
        notas: 'preservar-e2e',
      });
      await expect(
        runner.query(
          `UPDATE "servicios" SET estado_operativo = 'estado_inventado' WHERE id = $1`,
          [IDS.service],
        ),
      ).rejects.toThrow();
    } finally {
      await runner.release();
    }
  });

  it('recorre el golden path con transporte interno de ida y externo de regreso', async () => {
    await services.ofrecerAEmpleada(
      IDS.service,
      IDS.boss,
      'chofer',
      'Nota E2E',
      '101',
    );
    let persisted = await service();
    expect(persisted.operationalState).toBe('esperando_aceptacion_empleada');
    expect(employeeOperationActions(persisted.operationalState)).toEqual([
      'aceptar_servicio',
      'rechazar_servicio',
    ]);
    const offeredEvents = await eventTypes();
    await services.ofrecerAEmpleada(IDS.service, IDS.boss, 'chofer');
    expect(await eventTypes()).toEqual(offeredEvents);

    const acceptedService = await services.acceptByEmployee(
      IDS.service,
      IDS.employeeUser,
    );
    expect(acceptedService.operationalState).toBe('esperando_transporte_ida');
    persisted = await service();
    expect(persisted.operationalState).toBe('esperando_transporte_ida');
    expect(persisted.estado).toBe('pendiente');
    expect(persisted.horaInicioServicio).toBeNull();
    expect(persisted.employeeAcceptedAt).toBeInstanceOf(Date);
    expect(employeeOperationActions(persisted.operationalState)).toEqual([]);
    await expect(
      services.finishByEmployee(IDS.service, IDS.employeeUser),
    ).rejects.toBeInstanceOf(ConflictException);

    const [outboundBeforeAssignment] = await dataSource.query(
      `SELECT id, chofer_id, proveedor_transporte, estado
         FROM viajes WHERE servicio_id = $1 AND tipo = 'ida'`,
      [IDS.service],
    );
    expect(outboundBeforeAssignment).toBeUndefined();

    await services.assignInternalTransport(IDS.service, IDS.boss);
    const [outbound] = await dataSource.query(
      `SELECT id, chofer_id, proveedor_transporte, estado
         FROM viajes WHERE servicio_id = $1 AND tipo = 'ida'`,
      [IDS.service],
    );
    expect(outbound).toMatchObject({
      chofer_id: IDS.driver,
      proveedor_transporte: 'interno',
      estado: 'notificado',
    });

    const acceptedTrip = await driverTrips.aceptarOferta(
      outbound.id,
      IDS.driver,
    );
    expect(acceptedTrip.aceptado).toBe(true);
    const boss = await dataSource
      .getRepository(Usuarios)
      .findOneByOrFail({ id: IDS.boss });
    const listedService = (await services.findAll(boss)).find(
      (item) => item.id === IDS.service,
    );
    expect(listedService?.viajes[0]?.chofer).toMatchObject({
      nombre: 'Chofer E2E',
      vehiculoMarca: 'Nissan',
      vehiculoModelo: 'Versa',
      vehiculoColor: 'Negro',
      vehiculoPlaca: 'E2E-123',
    });
    persisted = await service();
    expect(persisted.operationalState).toBe('transporte_ida_asignado');
    expect(employeeOperationActions(persisted.operationalState)).toEqual([
      'marcar_en_camino',
    ]);

    await services.updateUberStatus(
      outbound.id,
      IDS.employeeUser,
      'employee_en_route',
    );
    persisted = await service();
    expect(persisted.operationalState).toBe('empleada_en_camino');
    expect(employeeOperationActions(persisted.operationalState)).toEqual([
      'marcar_llegada',
    ]);
    await services.updateUberStatus(
      outbound.id,
      IDS.employeeUser,
      'employee_arrived',
    );
    persisted = await service();
    expect(persisted.operationalState).toBe('empleada_llego');
    expect(employeeOperationActions(persisted.operationalState)).toEqual([
      'iniciar_servicio',
    ]);

    await services.startByEmployee(IDS.service, IDS.employeeUser);
    persisted = await service();
    expect(persisted.operationalState).toBe('en_curso');
    expect(persisted.estado).toBe('en_curso');
    expect(persisted.horaInicioServicio).toBeInstanceOf(Date);
    expect(employeeOperationActions(persisted.operationalState)).toEqual([
      'finalizar_servicio',
      'extender_servicio',
      'registrar_extra',
      'activar_panico',
    ]);
    await services.extendByEmployee(
      IDS.service,
      IDS.employeeUser,
      2,
      false,
      350,
    );
    await services.addServiceExtra({
      servicioId: IDS.service,
      extraCatalogoId: IDS.extra,
      metodoPago: 'transferencia',
      actorUserId: IDS.employeeUser,
      precioCobrado: 80,
    });
    const panic = await services.activatePanic(IDS.service, IDS.employeeUser);
    expect(panic.eventId).toBeDefined();
    expect(notifications.notificar).toHaveBeenCalledWith(
      IDS.boss,
      expect.objectContaining({ titulo: 'EMERGENCIA EN SERVICIO' }),
    );

    persisted = await service();
    expect(Number(persisted.duracionPactadaHoras)).toBe(3);
    const [extension] = await dataSource.query(
      `SELECT horas_agregadas, monto_agregado
         FROM extensiones_servicio WHERE servicio_id = $1`,
      [IDS.service],
    );
    expect(Number(extension.horas_agregadas)).toBe(2);
    expect(Number(extension.monto_agregado)).toBe(350);
    const [extra] = await dataSource.query(
      `SELECT precio_cobrado, metodo_pago
         FROM extras_servicio WHERE servicio_id = $1`,
      [IDS.service],
    );
    expect(Number(extra.precio_cobrado)).toBe(80);
    expect(extra.metodo_pago).toBe('transferencia');

    await services.finishByEmployee(IDS.service, IDS.employeeUser);
    persisted = await service();
    expect(persisted.operationalState).toBe('preparando_regreso');
    expect(persisted.estado).toBe('finalizado');

    await expect(
      services.chooseReturnTransport(IDS.service, IDS.boss, 'uber'),
    ).rejects.toBeInstanceOf(BadRequestException);
    const returnTrip = await services.assignExternalTransport(
      IDS.service,
      IDS.boss,
      {
        platform: 'DiDi',
        sharedLink: 'https://example.com/viaje-e2e',
        amount: 123.45,
      },
    );
    persisted = await service();
    expect(persisted.operationalState).toBe('transporte_regreso_asignado');
    expect(employeeOperationActions(persisted.operationalState)).toEqual([
      'marcar_regreso',
    ]);
    const [externalTrip] = await dataSource.query(
      `SELECT proveedor_transporte, external_platform, external_shared_link, tarifa,
              uber_screenshot_url
         FROM viajes WHERE id = $1`,
      [returnTrip.id],
    );
    expect(externalTrip).toMatchObject({
      proveedor_transporte: 'uber',
      external_platform: 'DiDi',
      external_shared_link: 'https://example.com/viaje-e2e',
    });
    expect(Number(externalTrip.tarifa)).toBe(123.45);
    expect(externalTrip.uber_screenshot_url).toBeNull();

    await services.updateUberStatus(
      returnTrip.id,
      IDS.employeeUser,
      'employee_en_route',
    );
    persisted = await service();
    expect(persisted.operationalState).toBe('empleada_de_regreso');
    expect(employeeOperationActions(persisted.operationalState)).toEqual([
      'marcar_llegada_regreso',
    ]);
    await services.updateUberStatus(
      returnTrip.id,
      IDS.employeeUser,
      'employee_arrived',
    );
    persisted = await service();
    expect(persisted.operationalState).toBe('finalizado');
    expect(employeeOperationActions(persisted.operationalState)).toEqual([]);

    const completedEvents = await eventTypes();
    expect(completedEvents).toEqual(
      expect.arrayContaining([
        'EMPLOYEE_ACCEPTANCE_REQUESTED',
        'EMPLOYEE_ACCEPTED_SERVICE',
        'TRANSPORT_ASSIGNED',
        'EMPLOYEE_EN_ROUTE',
        'EMPLOYEE_ARRIVED',
        'SERVICE_STARTED',
        'SERVICE_EXTENDED',
        'SERVICE_EXTRA_ADDED',
        'SERVICE_PANIC_ACTIVATED',
        'RETURN_PREPARATION_STARTED',
        'EXTERNAL_TRANSPORT_ASSIGNED',
        'EMPLOYEE_RETURNING',
        'SERVICE_FLOW_COMPLETED',
      ]),
    );
    const completedCount = completedEvents.length;
    await services.updateUberStatus(
      returnTrip.id,
      IDS.employeeUser,
      'employee_arrived',
    );
    expect((await eventTypes()).length).toBe(completedCount);

    const vocabulary = [
      ...SERVICE_OPERATION_STATES,
      ...SERVICE_OPERATION_ACTIONS,
    ].join(' ');
    expect(vocabulary).not.toMatch(/cobro[ _-]?verificado/i);
  });

  it('crea un viaje externo de ida sin viaje previo', async () => {
    await dataSource.query(
      `UPDATE "servicios" SET estado_operativo = 'esperando_transporte_ida'
        WHERE id = $1`,
      [IDS.service],
    );
    const [before] = await dataSource.query(
      `SELECT id FROM viajes WHERE servicio_id = $1 AND tipo = 'ida'`,
      [IDS.service],
    );
    expect(before).toBeUndefined();

    const trip = await services.assignExternalTransport(IDS.service, IDS.boss, {
      platform: 'Uber',
      sharedLink: 'https://example.com/viaje-ida-e2e',
      amount: 150,
    });

    const [persistedTrip] = await dataSource.query(
      `SELECT tipo, proveedor_transporte, external_platform,
              external_shared_link, tarifa
         FROM viajes WHERE id = $1`,
      [trip.id],
    );
    expect(persistedTrip).toMatchObject({
      tipo: 'ida',
      proveedor_transporte: 'uber',
      external_platform: 'Uber',
      external_shared_link: 'https://example.com/viaje-ida-e2e',
    });
    expect(Number(persistedTrip.tarifa)).toBe(150);
    expect((await service()).operationalState).toBe('transporte_ida_asignado');
    expect(realtime.emitToBoss).toHaveBeenCalledWith(
      IDS.boss,
      expect.objectContaining({ type: 'external_transport_assigned' }),
    );
    expect(realtime.emitToEmployee).toHaveBeenCalledWith(
      IDS.employee,
      expect.objectContaining({ type: 'external_transport_assigned' }),
    );
  });

  it('procesa 15 + 6 minutos y SERVICE_ENDING_SOON de forma determinista', async () => {
    await insertService(IDS.timerService, 'esperando_aceptacion_empleada');
    const initialDeadline = new Date('2026-10-05T10:15:00.000Z');
    await dataSource.query(
      `UPDATE servicios SET aceptacion_empleada_expira_at = $2 WHERE id = $1`,
      [IDS.timerService, initialDeadline],
    );
    await services.sweepEmployeeAcceptanceDeadlines(initialDeadline);
    let timed = await service(IDS.timerService);
    expect(timed.operationalState).toBe('esperando_aceptacion_empleada');
    expect(timed.employeeAcceptanceRemindedAt).toEqual(initialDeadline);
    expect(timed.employeeAcceptanceExpiresAt).toEqual(
      new Date('2026-10-05T10:21:00.000Z'),
    );
    await services.sweepEmployeeAcceptanceDeadlines(initialDeadline);
    expect(await eventTypes(IDS.timerService)).toEqual([
      'EMPLOYEE_ACCEPTANCE_REMINDER',
    ]);

    const escalationTime = new Date('2026-10-05T10:21:00.001Z');
    await services.sweepEmployeeAcceptanceDeadlines(escalationTime);
    await services.sweepEmployeeAcceptanceDeadlines(escalationTime);
    timed = await service(IDS.timerService);
    expect(timed.operationalState).toBe('expirado');
    expect(timed.employeeAcceptanceEscalatedAt).toEqual(escalationTime);
    expect(await eventTypes(IDS.timerService)).toEqual([
      'EMPLOYEE_ACCEPTANCE_REMINDER',
      'EMPLOYEE_ACCEPTANCE_ESCALATED',
    ]);
    const [sanctions] = await dataSource.query(
      `SELECT COUNT(*)::int AS count FROM disciplinary_sanctions`,
    );
    expect(sanctions.count).toBe(0);

    const now = new Date('2026-10-05T12:00:00.000Z');
    await dataSource.query(
      `UPDATE servicios
          SET estado = 'en_curso', estado_operativo = 'en_curso',
              hora_inicio_servicio = $2, duracion_pactada_horas = 1,
              aviso_fin_proximo_at = NULL
        WHERE id = $1`,
      [IDS.service, new Date('2026-10-05T11:15:00.000Z')],
    );
    await services.sweepServicesEndingSoon(now);
    await services.sweepServicesEndingSoon(now);
    expect(await eventTypes()).toEqual(['SERVICE_ENDING_SOON']);
    expect((await service()).endingSoonNotifiedAt).toEqual(now);
    expect(notifications.notificar).toHaveBeenCalledWith(
      IDS.employeeUser,
      expect.objectContaining({ titulo: 'Tu servicio termina pronto' }),
    );
    expect(notifications.notificar).toHaveBeenCalledWith(
      IDS.boss,
      expect.objectContaining({ titulo: 'Prepara el transporte de regreso' }),
    );
  });

  it('opera de extremo a extremo una conversación pre-servicio con ownership', async () => {
    const api = '/api/v1';
    await dataSource.query('DELETE FROM servicios');
    expect(
      parseTelegramStartPayload(`/start contratar_${IDS.employee}`),
    ).toEqual({ type: 'employee_hire', employeeId: IDS.employee });
    await dataSource.query(
      `INSERT INTO telegram_sessions (key, data)
       VALUES ('9001:9001', jsonb_build_object(
         'bookingSessionId', $1::text,
         'empleadaId', $2::text,
         'iaActiva', true,
         'humanTakeover', false,
         'bookingStatus', 'COLLECTING',
         'step', 'CHAT_CON_EMPLEADA',
         'duracionPactadaHoras', 2,
         'metodoPago', 'efectivo'
       ))`,
      [IDS.booking, IDS.employee],
    );

    await (bookingUpdate as any).recordDraftConversation(
      {
        from: { id: 9001 },
        session: {
          bookingSessionId: IDS.booking,
          empleadaId: IDS.employee,
          iaActiva: true,
          humanTakeover: false,
        },
      },
      'cliente',
      'Primer mensaje pre-servicio E2E',
    );

    expect(realtime.emitToBosses).toHaveBeenCalledWith(
      [IDS.boss],
      expect.objectContaining({
        type: 'chat_message',
        data: expect.objectContaining({
          servicioId: null,
          bookingSessionId: IDS.booking,
          intendedEmployeeId: IDS.employee,
        }),
      }),
    );
    expect(realtime.emitToJefes).not.toHaveBeenCalled();

    const bossToken = await accessToken(IDS.boss);
    const otherBossToken = await accessToken(IDS.otherBoss);
    const ownerList = await request(app!.getHttpServer())
      .get(`${api}/telegram-conversations/pre-service`)
      .set('Authorization', `Bearer ${bossToken}`)
      .expect(200);
    expect(ownerList.body).toEqual([
      expect.objectContaining({
        bookingSessionId: IDS.booking,
        service: null,
        intendedEmployee: { id: IDS.employee, name: 'Luna E2E' },
        bookingData: expect.objectContaining({
          durationHours: 2,
          paymentMethod: 'efectivo',
        }),
      }),
    ]);
    await request(app!.getHttpServer())
      .get(`${api}/telegram-conversations/pre-service`)
      .set('Authorization', `Bearer ${otherBossToken}`)
      .expect(200)
      .expect([]);
    await request(app!.getHttpServer())
      .get(`${api}/telegram-conversations/session/${IDS.booking}`)
      .set('Authorization', `Bearer ${otherBossToken}`)
      .expect(403);
    const history = await request(app!.getHttpServer())
      .get(`${api}/telegram-conversations/session/${IDS.booking}`)
      .set('Authorization', `Bearer ${bossToken}`)
      .expect(200);
    expect(history.body).toEqual([
      expect.objectContaining({ mensaje: 'Primer mensaje pre-servicio E2E' }),
    ]);

    await request(app!.getHttpServer())
      .post(`${api}/telegram-conversations/session/${IDS.booking}/toggle-ai`)
      .set('Authorization', `Bearer ${bossToken}`)
      .send({ iaActiva: false })
      .expect(201);
    const [pausedSession] = await dataSource.query(
      `SELECT data FROM telegram_sessions WHERE key = '9001:9001'`,
    );
    expect(pausedSession.data).toMatchObject({
      iaActiva: false,
      humanTakeover: true,
    });

    await request(app!.getHttpServer())
      .post(`${api}/telegram-conversations/session/${IDS.booking}/messages`)
      .set('Authorization', `Bearer ${bossToken}`)
      .send({ message: 'Respuesta humana pre-servicio E2E' })
      .expect(201);
    const [persistedReply] = await dataSource.query(
      `SELECT emisor, mensaje, ia_activa
         FROM conversaciones_telegram
        WHERE booking_session_id = $1 AND mensaje = $2`,
      [IDS.booking, 'Respuesta humana pre-servicio E2E'],
    );
    expect(persistedReply).toMatchObject({
      emisor: 'jefe',
      mensaje: 'Respuesta humana pre-servicio E2E',
      ia_activa: false,
    });

    await request(app!.getHttpServer())
      .post(`${api}/telegram-conversations/session/${IDS.booking}/toggle-ai`)
      .set('Authorization', `Bearer ${bossToken}`)
      .send({ iaActiva: true })
      .expect(201);
    const [resumedSession] = await dataSource.query(
      `SELECT data FROM telegram_sessions WHERE key = '9001:9001'`,
    );
    expect(resumedSession.data).toMatchObject({
      iaActiva: true,
      humanTakeover: false,
    });

    await insertService(IDS.draftService, 'preparacion');
    await (bookingUpdate as any).attachAndReplayDraftConversation(
      IDS.booking,
      await service(IDS.draftService),
      '-100-e2e',
    );
    const afterLink = await request(app!.getHttpServer())
      .get(`${api}/telegram-conversations/pre-service`)
      .set('Authorization', `Bearer ${bossToken}`)
      .expect(200);
    expect(afterLink.body).toEqual([]);
    const linkedHistory = await request(app!.getHttpServer())
      .get(`${api}/telegram-conversations/service/${IDS.draftService}`)
      .set('Authorization', `Bearer ${bossToken}`)
      .expect(200);
    expect(
      linkedHistory.body.messages.map(
        (row: { mensaje: string }) => row.mensaje,
      ),
    ).toEqual(
      expect.arrayContaining([
        'Primer mensaje pre-servicio E2E',
        'Respuesta humana pre-servicio E2E',
      ]),
    );
    const [{ count }] = await dataSource.query(
      `SELECT COUNT(DISTINCT booking_session_id)::int AS count
         FROM conversaciones_telegram
        WHERE booking_session_id = $1`,
      [IDS.booking],
    );
    expect(count).toBe(1);
  });

  it('prohíbe el acceso cruzado a una conversación de otra empleada y equipo', async () => {
    await dataSource.query(
      `INSERT INTO telegram_sessions (key, data)
       VALUES ('9001:other', jsonb_build_object(
         'bookingSessionId', $1::text,
         'empleadaId', $2::text,
         'iaActiva', true,
         'humanTakeover', false,
         'bookingStatus', 'COLLECTING',
         'step', 'CHAT_CON_EMPLEADA'
       ))`,
      [IDS.otherBooking, IDS.otherEmployee],
    );
    await (bookingUpdate as any).recordDraftConversation(
      {
        from: { id: 9001 },
        session: {
          bookingSessionId: IDS.otherBooking,
          empleadaId: IDS.otherEmployee,
          iaActiva: true,
        },
      },
      'cliente',
      'Mensaje del otro equipo E2E',
    );

    const bossToken = await accessToken(IDS.boss);
    const otherBossToken = await accessToken(IDS.otherBoss);
    await request(app!.getHttpServer())
      .get(`/api/v1/telegram-conversations/session/${IDS.otherBooking}`)
      .set('Authorization', `Bearer ${bossToken}`)
      .expect(403);
    const otherTeamList = await request(app!.getHttpServer())
      .get('/api/v1/telegram-conversations/pre-service')
      .set('Authorization', `Bearer ${otherBossToken}`)
      .expect(200);
    expect(otherTeamList.body).toEqual([
      expect.objectContaining({
        bookingSessionId: IDS.otherBooking,
        intendedEmployee: {
          id: IDS.otherEmployee,
          name: 'Sol E2E',
        },
      }),
    ]);
  });

  describe('superficie HTTP del flujo operativo', () => {
    const api = '/api/v1';

    it('exige autenticación y rol correcto sin modificar el servicio', async () => {
      await request(app!.getHttpServer())
        .post(`${api}/employee-portal/services/${IDS.service}/accept`)
        .expect(401);

      const employeeToken = await accessToken(IDS.employeeUser);
      await request(app!.getHttpServer())
        .post(`${api}/services/${IDS.service}/aceptar`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ transportType: 'chofer' })
        .expect(403);

      expect((await service()).operationalState).toBe('preparacion');
      expect(await eventTypes()).toEqual([]);
    });

    it('rechaza payload inválido antes del dominio', async () => {
      const employeeToken = await accessToken(IDS.employeeUser);
      await request(app!.getHttpServer())
        .post(`${api}/employee-portal/services/${IDS.service}/extend`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .send({ horas: 0, campoInesperado: true })
        .expect(400);

      expect(Number((await service()).duracionPactadaHoras)).toBe(1);
      expect(await eventTypes()).toEqual([]);
    });

    it('aísla servicios por jefe y permite al jefe asignado operar', async () => {
      const otherBossToken = await accessToken(IDS.otherBoss);
      await request(app!.getHttpServer())
        .post(`${api}/services/${IDS.service}/aceptar`)
        .set('Authorization', `Bearer ${otherBossToken}`)
        .send({ transportType: 'chofer' })
        .expect(409);
      expect((await service()).operationalState).toBe('preparacion');

      const bossToken = await accessToken(IDS.boss);
      await request(app!.getHttpServer())
        .post(`${api}/services/${IDS.service}/aceptar`)
        .set('Authorization', `Bearer ${bossToken}`)
        .send({ transportType: 'chofer' })
        .expect(201);
      expect((await service()).operationalState).toBe(
        'esperando_aceptacion_empleada',
      );
    });

    it('aplica CSRF a cookie, acepta el actor correcto y no duplica la aceptación', async () => {
      await services.ofrecerAEmpleada(IDS.service, IDS.boss, 'chofer');
      const token = await accessToken(IDS.employeeUser);
      const cookies = [
        signedCookie('access_token', token),
        'csrf_token=csrf-e2e',
      ];

      await request(app!.getHttpServer())
        .post(`${api}/employee-portal/services/${IDS.service}/accept`)
        .set('Cookie', cookies)
        .expect(403);
      expect((await service()).operationalState).toBe(
        'esperando_aceptacion_empleada',
      );

      await request(app!.getHttpServer())
        .post(`${api}/employee-portal/services/${IDS.service}/accept`)
        .set('Cookie', cookies)
        .set('x-csrf-token', 'csrf-e2e')
        .expect(200);

      await request(app!.getHttpServer())
        .post(`${api}/employee-portal/services/${IDS.service}/accept`)
        .set('Authorization', `Bearer ${token}`)
        .expect(409);

      expect((await service()).operationalState).toBe(
        'esperando_transporte_ida',
      );
      expect(
        (await eventTypes()).filter(
          (type) => type === 'EMPLOYEE_ACCEPTED_SERVICE',
        ),
      ).toHaveLength(1);
    });

    it('rechaza una transición fuera de orden sin tocar estado ni eventos', async () => {
      await services.ofrecerAEmpleada(IDS.service, IDS.boss, 'chofer');
      await services.acceptByEmployee(IDS.service, IDS.employeeUser);
      const before = await eventTypes();
      const employeeToken = await accessToken(IDS.employeeUser);

      await request(app!.getHttpServer())
        .post(`${api}/employee-portal/services/${IDS.service}/start`)
        .set('Authorization', `Bearer ${employeeToken}`)
        .expect(409);

      const persisted = await service();
      expect(persisted.operationalState).toBe('esperando_transporte_ida');
      expect(persisted.horaInicioServicio).toBeNull();
      expect(await eventTypes()).toEqual(before);
    });

    it('serializa el doble inicio y genera un solo evento', async () => {
      await dataSource.query(
        `UPDATE servicios
            SET estado = 'pendiente', estado_operativo = 'empleada_llego',
                hora_inicio_servicio = NULL
          WHERE id = $1`,
        [IDS.service],
      );
      const employeeToken = await accessToken(IDS.employeeUser);
      const responses = await Promise.all([
        request(app!.getHttpServer())
          .post(`${api}/employee-portal/services/${IDS.service}/start`)
          .set('Authorization', `Bearer ${employeeToken}`),
        request(app!.getHttpServer())
          .post(`${api}/employee-portal/services/${IDS.service}/start`)
          .set('Authorization', `Bearer ${employeeToken}`),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      expect((await service()).operationalState).toBe('en_curso');
      expect(
        (await eventTypes()).filter((type) => type === 'SERVICE_STARTED'),
      ).toHaveLength(1);
    });

    it('serializa la doble finalización y prepara un solo regreso', async () => {
      await dataSource.query(
        `UPDATE servicios
            SET estado = 'en_curso', estado_operativo = 'en_curso',
                hora_inicio_servicio = now() - interval '30 minutes'
          WHERE id = $1`,
        [IDS.service],
      );
      const employeeToken = await accessToken(IDS.employeeUser);
      const responses = await Promise.all([
        request(app!.getHttpServer())
          .post(`${api}/employee-portal/services/${IDS.service}/finish`)
          .set('Authorization', `Bearer ${employeeToken}`),
        request(app!.getHttpServer())
          .post(`${api}/employee-portal/services/${IDS.service}/finish`)
          .set('Authorization', `Bearer ${employeeToken}`),
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      expect((await service()).operationalState).toBe('preparando_regreso');
      expect(
        (await eventTypes()).filter(
          (type) => type === 'RETURN_PREPARATION_STARTED',
        ),
      ).toHaveLength(1);
    });

    it('impide que otro jefe use controles manuales sobre el servicio', async () => {
      await dataSource.query(
        `UPDATE servicios
            SET estado = 'en_curso', estado_operativo = 'en_curso',
                hora_inicio_servicio = now(), duracion_pactada_horas = 1
          WHERE id = $1`,
        [IDS.service],
      );
      const otherBossToken = await accessToken(IDS.otherBoss);

      await request(app!.getHttpServer())
        .post(`${api}/services/${IDS.service}/manual-controls/extend`)
        .set('Authorization', `Bearer ${otherBossToken}`)
        .send({ horas: 1 })
        .expect(409);

      expect(Number((await service()).duracionPactadaHoras)).toBe(1);
      expect(await eventTypes()).toEqual([]);
    });
  });

  it('crea dos servicios independientes para el mismo cliente y conserva el historial', async () => {
    await dataSource.query('DELETE FROM servicios');
    await dataSource.query(
      `UPDATE usuarios SET telegram_chat_id = CASE WHEN id = $1 THEN 9012 ELSE 9013 END
         WHERE id IN ($1, $2)`,
      [IDS.boss, IDS.otherBoss],
    );

    const [client] = await dataSource.query(
      `SELECT id, nombre_telegram AS "nombreTelegram"
         FROM clientes WHERE id = $1`,
      [IDS.client],
    );
    const [employeeA] = await dataSource.query(
      `SELECT id, nombre_artistico AS "nombreArtistico", precio_base_hora AS "precioBaseHora", jefe_id AS "jefeId"
         FROM empleadas WHERE id = $1`,
      [IDS.employee],
    );
    const [employeeB] = await dataSource.query(
      `SELECT id, nombre_artistico AS "nombreArtistico", precio_base_hora AS "precioBaseHora", jefe_id AS "jefeId"
         FROM empleadas WHERE id = $1`,
      [IDS.otherEmployee],
    );
    const pause = jest
      .spyOn(bookingUpdate as any, 'pausaComoSiLoEstuvieraEscribiendo')
      .mockResolvedValue(undefined);

    const buildContext = (bookingSessionId: string, employeeId: string) =>
      ({
        from: { id: 9001, first_name: 'Cliente E2E' },
        session: {
          bookingSessionId,
          bookingStatus: 'READY',
          empleadaId: employeeId,
          duracionPactadaHoras: 2,
          metodoPago: 'efectivo',
          locationNameSnapshot: 'Hotel E2E',
        },
        reply: jest.fn().mockResolvedValue(undefined),
        sendChatAction: jest.fn().mockResolvedValue(undefined),
        telegram: {
          sendChatAction: jest.fn().mockResolvedValue(undefined),
          sendMessage: jest.fn().mockResolvedValue({ message_id: 901 }),
        },
      }) as any;

    try {
      const first = buildContext(IDS.booking, employeeB.id);
      await (bookingUpdate as any).recordDraftConversation(
        first,
        'cliente',
        'Quiero dos horas con Sol E2E',
      );
      const serviceOne = await bookingUpdate.finalizeBooking(
        first,
        client,
        employeeB,
        2,
        'efectivo',
        '4.7109000',
        '-74.0721000',
        'Hotel E2E',
        '9001',
      );
      expect(serviceOne).toBeDefined();
      expect(first.session.bookingStatus).toBe('SERVICE_CREATED');
      expect(first.session.bookingServiceId).toBe(serviceOne!.id);

      const duplicate = await bookingUpdate.finalizeBooking(
        first,
        client,
        employeeB,
        2,
        'efectivo',
        '4.7109000',
        '-74.0721000',
        'Hotel E2E',
        '9001',
      );
      expect(duplicate!.id).toBe(serviceOne!.id);

      const second = buildContext(IDS.otherBooking, employeeA.id);
      await (bookingUpdate as any).recordDraftConversation(
        second,
        'cliente',
        'Una semana despues quiero otro servicio con Luna E2E',
      );
      const serviceTwo = await bookingUpdate.finalizeBooking(
        second,
        client,
        employeeA,
        1,
        'tarjeta',
        '4.7209000',
        '-74.0821000',
        'Domicilio E2E',
        '9001',
      );
      expect(serviceTwo).toBeDefined();
      expect(serviceTwo!.id).not.toBe(serviceOne!.id);
      expect(second.session.bookingSessionId).toBe(IDS.otherBooking);

      const services = await dataSource.query(
        `SELECT id, booking_session_id, empleada_id, metodo_pago
           FROM servicios
          WHERE id IN ($1, $2)
          ORDER BY id`,
        [serviceOne!.id, serviceTwo!.id],
      );
      expect(services).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: serviceOne!.id,
            booking_session_id: IDS.booking,
            empleada_id: employeeB.id,
          }),
          expect.objectContaining({
            id: serviceTwo!.id,
            booking_session_id: IDS.otherBooking,
            empleada_id: employeeA.id,
          }),
        ]),
      );

      const history = await dataSource.query(
        `SELECT booking_session_id, servicio_id, mensaje
           FROM conversaciones_telegram
          WHERE booking_session_id IN ($1, $2)
          ORDER BY enviado_at`,
        [IDS.booking, IDS.otherBooking],
      );
      expect(history).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            booking_session_id: IDS.booking,
            servicio_id: serviceOne!.id,
          }),
          expect.objectContaining({
            booking_session_id: IDS.otherBooking,
            servicio_id: serviceTwo!.id,
          }),
        ]),
      );
    } finally {
      pause.mockRestore();
    }
  });
});
