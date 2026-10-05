import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getBotToken } from 'nestjs-telegraf';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { AiMessageService } from '../src/ai/ai-message.service';
import { DriverTripsService } from '../src/drivers/driver-trips.service';
import { NotificationsService } from '../src/notifications/notifications.service';
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
import { TelegramService } from '../src/telegram/telegram.service';
import { CreateServiceOperationsCore1810000000000 } from '../src/migrations/1810000000000-CreateServiceOperationsCore';

const IDS = {
  boss: '11111111-1111-4111-8111-111111111111',
  employeeUser: '22222222-2222-4222-8222-222222222222',
  employee: '33333333-3333-4333-8333-333333333333',
  client: '44444444-4444-4444-8444-444444444444',
  driverUser: '55555555-5555-4555-8555-555555555555',
  driver: '66666666-6666-4666-8666-666666666666',
  service: '77777777-7777-4777-8777-777777777777',
  extra: '88888888-8888-4888-8888-888888888888',
  timerService: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
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
const bot = { telegram, catch: jest.fn(), stop: jest.fn() };

const notifications = {
  notificar: jest.fn((_userId: string, message: { titulo: string }) => {
    if (message.titulo === 'EMERGENCIA EN SERVICIO') {
      return Promise.reject(
        new Error('push E2E intencionalmente no disponible'),
      );
    }
    return Promise.resolve();
  }),
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
  let dataSource: DataSource;
  let services: ServicesService;
  let driverTrips: DriverTripsService;
  let conversations: TelegramConversationsService;

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
      .overrideProvider(RealtimeEventsService)
      .useValue(realtime)
      .compile();

    dataSource = moduleFixture.get(DataSource);
    services = moduleFixture.get(ServicesService);
    driverTrips = moduleFixture.get(DriverTripsService);
    conversations = moduleFixture.get(TelegramConversationsService);
  });

  afterAll(async () => {
    if (moduleFixture) await moduleFixture.close();
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
        ($2, 'empleada-e2e@example.com', 'hash', 'empleada', 'Empleada E2E', NULL, true, true, true),
        ($3, 'chofer-e2e@example.com', 'hash', 'chofer', 'Chofer E2E', 9003, true, true, true)`,
      [IDS.boss, IDS.employeeUser, IDS.driverUser],
    );
    await dataSource.query(
      `INSERT INTO "empleadas"
        (id, usuario_id, nombre_real, nombre_artistico, slug_catalogo,
         precio_base_hora, disponible, catalogo_activo, ubicacion_lat,
         ubicacion_lng, ultima_ubicacion_at, jefe_id, modo_bot)
       VALUES ($1, $2, 'Empleada E2E', 'Luna E2E', 'luna-e2e', 200,
               true, true, 4.7109000, -74.0721000, now(), $3, false)`,
      [IDS.employee, IDS.employeeUser, IDS.boss],
    );
    await dataSource.query(
      `INSERT INTO "clientes" (id, telegram_chat_id, nombre_telegram)
       VALUES ($1, 9001, 'Cliente E2E')`,
      [IDS.client],
    );
    await dataSource.query(
      `INSERT INTO "choferes"
        (id, usuario_id, nombre, telefono, disponible, ubicacion_lat,
         ubicacion_lng, ultima_ubicacion_at, modo_bot)
       VALUES ($1, $2, 'Chofer E2E', '3000000000', true, 4.7110000,
               -74.0720000, now(), true)`,
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
    expect(persisted.employeeAcceptedAt).toBeInstanceOf(Date);
    expect(employeeOperationActions(persisted.operationalState)).toEqual([]);

    const [outbound] = await dataSource.query(
      `SELECT id, chofer_id, proveedor_transporte, estado
         FROM viajes WHERE servicio_id = $1 AND tipo = 'ida'`,
      [IDS.service],
    );
    expect(outbound).toMatchObject({
      chofer_id: IDS.driver,
      proveedor_transporte: 'chofer',
      estado: 'notificado',
    });

    const acceptedTrip = await driverTrips.aceptarOferta(
      outbound.id,
      IDS.driver,
    );
    expect(acceptedTrip.aceptado).toBe(true);
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

    const returnChoice = await services.chooseReturnTransport(
      IDS.service,
      IDS.boss,
      'uber',
    );
    persisted = await service();
    expect(persisted.operationalState).toBe('transporte_regreso_asignado');
    expect(employeeOperationActions(persisted.operationalState)).toEqual([
      'marcar_regreso',
    ]);
    await services.registerExternalTransportDetails(
      returnChoice.trip.id,
      IDS.boss,
      {
        platform: 'DiDi',
        sharedLink: 'https://example.com/viaje-e2e',
        amount: 123.45,
      },
    );
    const [externalTrip] = await dataSource.query(
      `SELECT proveedor_transporte, external_platform, external_shared_link, tarifa
         FROM viajes WHERE id = $1`,
      [returnChoice.trip.id],
    );
    expect(externalTrip).toMatchObject({
      proveedor_transporte: 'uber',
      external_platform: 'DiDi',
      external_shared_link: 'https://example.com/viaje-e2e',
    });
    expect(Number(externalTrip.tarifa)).toBe(123.45);

    await services.updateUberStatus(
      returnChoice.trip.id,
      IDS.employeeUser,
      'employee_en_route',
    );
    persisted = await service();
    expect(persisted.operationalState).toBe('empleada_de_regreso');
    expect(employeeOperationActions(persisted.operationalState)).toEqual([
      'marcar_llegada_regreso',
    ]);
    await services.updateUberStatus(
      returnChoice.trip.id,
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
        'EXTERNAL_TRANSPORT_DETAILS_REGISTERED',
        'EMPLOYEE_RETURNING',
        'SERVICE_FLOW_COMPLETED',
      ]),
    );
    const completedCount = completedEvents.length;
    await services.updateUberStatus(
      returnChoice.trip.id,
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

  it('bloquea la IA durante takeover, conserva historial y permite reactivarla', async () => {
    await dataSource.query(
      `INSERT INTO telegram_sessions (key, data)
       VALUES ('9001:9001', '{"iaActiva":true,"humanTakeover":false}'::jsonb)`,
    );
    await dataSource.query(
      `INSERT INTO conversaciones_telegram
        (cliente_id, servicio_id, emisor, mensaje, ia_activa)
       VALUES ($1, $2, 'cliente', 'Primer mensaje E2E', true)`,
      [IDS.client, IDS.service],
    );
    const boss = { id: IDS.boss, rol: 'jefe' } as never;
    await expect(
      conversations.sendAdminMessageByClient(
        IDS.client,
        boss,
        'Respuesta prematura',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    const takeover = await conversations.toggleAiByClient(
      IDS.client,
      boss,
      false,
    );
    expect(takeover.iaActiva).toBe(false);
    const [pausedSession] = await dataSource.query(
      `SELECT data FROM telegram_sessions WHERE key = '9001:9001'`,
    );
    expect(pausedSession.data).toMatchObject({
      iaActiva: false,
      humanTakeover: true,
    });
    expect((await service()).iaActiva).toBe(false);

    await conversations.sendAdminMessageByClient(
      IDS.client,
      boss,
      'Respuesta humana E2E',
    );
    let history = await conversations.findHistoryByClient(IDS.client, boss);
    expect(history.map((row) => row.mensaje)).toEqual(
      expect.arrayContaining([
        'Primer mensaje E2E',
        '⏸️ Bot pausado por el administrador.',
        'Respuesta humana E2E',
      ]),
    );
    expect(history.at(-1)).toMatchObject({
      emisor: 'jefe',
      iaActiva: false,
    });

    await conversations.toggleAiByClient(IDS.client, boss, true);
    const [resumedSession] = await dataSource.query(
      `SELECT data FROM telegram_sessions WHERE key = '9001:9001'`,
    );
    expect(resumedSession.data).toMatchObject({
      iaActiva: true,
      humanTakeover: false,
    });
    expect((await service()).iaActiva).toBe(true);
    history = await conversations.findHistoryByClient(IDS.client, boss);
    expect(history.at(-1)).toMatchObject({
      emisor: 'sistema',
      iaActiva: true,
    });
    expect(telegram.sendMessage).toHaveBeenCalledWith(
      '9001',
      'Respuesta humana E2E',
    );
  });
});
