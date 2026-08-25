import { Telegraf } from 'telegraf';
import { TelegramBotRegistryService } from './telegram-bot-registry.service';
import { EmployeeTelegramBot } from './entities/employee-telegram-bot.entity';

jest.mock('telegraf', () => {
  // Se conserva el resto del modulo (Scenes, Composer, Markup...):
  // nestjs-telegraf lo carga al importar el servicio y no arranca sin el.
  const real = jest.requireActual('telegraf');
  const instances: any[] = [];
  class FakeTelegraf {
    static instances = instances;
    /** Se resuelve/rechaza a mano para simular la vida del long polling. */
    lanzamiento?: { resolve: () => void; reject: (error: Error) => void };
    launched = false;
    stopped = false;
    botInfo: unknown;
    telegram = {
      getMe: jest.fn().mockResolvedValue({ id: 1, username: 'modelo_bot' }),
      setWebhook: jest.fn().mockResolvedValue(true),
      deleteWebhook: jest.fn().mockResolvedValue(true),
      callApi: jest.fn().mockResolvedValue({ ok: true }),
    };
    constructor(public token: string) {
      instances.push(this);
    }
    use() {
      return this;
    }
    catch() {
      return this;
    }
    middleware() {
      return () => Promise.resolve();
    }
    launch() {
      this.launched = true;
      return new Promise<void>((resolve, reject) => {
        this.lanzamiento = { resolve, reject };
      });
    }
    stop() {
      this.stopped = true;
    }
  }
  return { ...real, Telegraf: FakeTelegraf };
});

const FakeTelegraf = Telegraf as unknown as {
  instances: any[];
};

function buildRecord(): EmployeeTelegramBot {
  return {
    id: 'rec-1',
    employeeId: 'emp-1',
    tokenCiphertext: 'cifrado',
    tokenHint: '123…abc',
    webhookSecret: 'secreto',
    status: 'activo',
    lastError: null,
    botId: null,
    botUsername: null,
  } as unknown as EmployeeTelegramBot;
}

function buildService() {
  const record = buildRecord();
  const botsRepository = {
    find: jest.fn().mockResolvedValue([record]),
    update: jest.fn().mockResolvedValue({}),
    findOne: jest.fn().mockResolvedValue(record),
    findOneOrFail: jest.fn().mockResolvedValue(record),
    delete: jest.fn().mockResolvedValue({}),
    save: jest.fn().mockResolvedValue(record),
  };
  const centralBot = {
    telegram: { callApi: jest.fn().mockResolvedValue({ ok: true }) },
    middleware: () => () => Promise.resolve(),
  };
  const service = new TelegramBotRegistryService(
    centralBot as never,
    botsRepository as never,
    { decrypt: () => 'token-en-claro' } as never,
    // Sin URL de webhook: long polling, que es el modo por defecto.
    { get: (_key: string, fallback?: unknown) => fallback ?? '' } as never,
  );
  return { service, record, botsRepository, centralBot };
}

/** Deja correr las promesas pendientes sin depender de temporizadores. */
const vaciarCola = () => new Promise((resolve) => setImmediate(resolve));

describe('TelegramBotRegistryService', () => {
  beforeEach(() => {
    FakeTelegraf.instances.length = 0;
  });

  it('deja el bot de la empleada disponible tras arrancarlo', async () => {
    const { service, record } = buildService();
    await (service as any).arrancarBotsDedicados();

    expect(FakeTelegraf.instances).toHaveLength(1);
    expect(service.botForEmployee(record.employeeId)).toBe(
      FakeTelegraf.instances[0],
    );
  });

  /**
   * El fallo que cubre esta prueba: el bucle de long polling de Telegraf muere
   * para siempre ante un 409 —otro proceso pidiendo `getUpdates` con el mismo
   * token, tipico cuando se solapan dos despliegues— y antes eso solo se
   * anotaba en el log. El bot seguia marcado como activo y podia seguir
   * enviando, pero no recibia un solo mensaje mas: el cliente escribia a la
   * modelo y no le contestaba nadie, ni la IA ni los menus.
   */
  it('recupera el bot cuyo long polling se murio', async () => {
    const { service, record, botsRepository } = buildService();
    await (service as any).arrancarBotsDedicados();
    const primero = FakeTelegraf.instances[0];

    primero.lanzamiento.reject(
      Object.assign(new Error('409: Conflict'), {
        response: { error_code: 409 },
      }),
    );
    await vaciarCola();

    // Queda constancia y el registro pasa a error, pero el bot NO se descarta:
    // enviar sigue funcionando y es el unico bot que el cliente tiene abierto.
    expect(botsRepository.update).toHaveBeenCalledWith(
      record.id,
      expect.objectContaining({ status: 'error' }),
    );
    expect(service.botForEmployee(record.employeeId)).toBe(primero);

    await (service as any).reconciliar();

    expect(FakeTelegraf.instances).toHaveLength(2);
    const segundo = FakeTelegraf.instances[1];
    expect(segundo.launched).toBe(true);
    expect(service.botForEmployee(record.employeeId)).toBe(segundo);
  });

  it('no vuelve a levantar un bot que sigue recibiendo', async () => {
    const { service } = buildService();
    await (service as any).arrancarBotsDedicados();

    await (service as any).reconciliar();

    expect(FakeTelegraf.instances).toHaveLength(1);
  });

  /**
   * Un bot que se detiene a proposito —al reemplazar su token o al apagar la
   * aplicacion— no es una caida, y la vigilancia no debe resucitarlo por su
   * cuenta a partir de la promesa de `launch()` que se resuelve al pararlo.
   */
  it('no confunde una parada deliberada con una caida', async () => {
    const { service, botsRepository } = buildService();
    await (service as any).arrancarBotsDedicados();
    const primero = FakeTelegraf.instances[0];
    botsRepository.update.mockClear();

    await (service as any).stopBot('emp-1');
    primero.lanzamiento.resolve();
    await vaciarCola();

    expect(botsRepository.update).not.toHaveBeenCalled();
  });
});
