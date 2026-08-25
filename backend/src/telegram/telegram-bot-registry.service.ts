import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Telegraf, Context } from 'telegraf';
import { Update } from 'telegraf/typings/core/types/typegram';
import { EmployeeTelegramBot } from './entities/employee-telegram-bot.entity';
import { TelegramCryptoService } from './telegram-crypto.service';
import { describeError } from '../common/errors/error-message';
import { installSendThrottle } from './telegram-send-throttle';

/**
 * Contexto extendido con la identidad del bot dedicado por el que entró el
 * update. Los handlers existentes lo usan para saber de qué empleada es el
 * chat sin cambiar su firma.
 */
/** Margen para que Telegram conteste al identificar un bot al arrancarlo. */
const GETME_TIMEOUT_MS = 10_000;

/**
 * Falla una promesa que tarda de mas, en vez de esperarla para siempre.
 *
 * Las llamadas a la API de Telegram no traen limite de tiempo propio: una que
 * no responde se queda colgada indefinidamente y arrastra a todo lo que la
 * espere.
 */
function conLimiteDeTiempo<T>(
  promesa: Promise<T>,
  ms: number,
  descripcion: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const temporizador = setTimeout(() => {
      reject(new Error(`${descripcion} no respondio en ${ms} ms`));
    }, ms);
    promesa.then(
      (valor) => {
        clearTimeout(temporizador);
        resolve(valor);
      },
      (error) => {
        clearTimeout(temporizador);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export interface DedicatedBotContext extends Context {
  dedicatedBotEmployeeId?: string;
  dedicatedBotId?: string;
}

interface RegisteredBot {
  recordId: string;
  employeeId: string;
  bot: Telegraf<Context>;
}

@Injectable()
export class TelegramBotRegistryService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TelegramBotRegistryService.name);
  private readonly byEmployee = new Map<string, RegisteredBot>();
  private readonly byRecord = new Map<string, RegisteredBot>();

  constructor(
    @InjectBot() private readonly centralBot: Telegraf<Context>,
    @InjectRepository(EmployeeTelegramBot)
    private readonly botsRepository: Repository<EmployeeTelegramBot>,
    private readonly crypto: TelegramCryptoService,
    private readonly configService: ConfigService,
  ) {}

  private get webhookBaseUrl(): string {
    return this.configService
      .get<string>('TELEGRAM_WEBHOOK_BASE_URL', '')
      .replace(/\/+$/, '');
  }

  /** En local no hay URL pública, así que los bots dedicados usan long polling. */
  private get usesWebhooks(): boolean {
    return this.webhookBaseUrl.length > 0;
  }

  /**
   * Impide arrancar en la combinación que rompe el bot sin dar la cara.
   *
   * Con long polling, dos procesos pidiendo `getUpdates` sobre el mismo token
   * no se reparten el trabajo: Telegram responde 409 y uno de los dos deja de
   * recibir mensajes. No es una degradación, es un bot que se calla, y desde
   * fuera parece que los clientes han dejado de escribir.
   *
   * Los ciclos periódicos ya toleran varias réplicas gracias a los advisory
   * locks, así que el día que se escale, esto es lo que queda por resolver: hay
   * que pasar a webhook antes. Falla al arrancar en vez de dejarlo pasar.
   */
  private assertPollingIsSafe(): void {
    const instances = Number(
      this.configService.get<string | number>('APP_INSTANCE_COUNT', 1),
    );
    if (instances <= 1 || this.usesWebhooks) return;

    throw new Error(
      `APP_INSTANCE_COUNT=${instances} con long polling: Telegram solo admite un proceso ` +
        'haciendo getUpdates por token, así que las demás réplicas dejarían de recibir ' +
        'mensajes. Define TELEGRAM_WEBHOOK_BASE_URL (y habilita el bloque de webhook en ' +
        'nginx) o vuelve a una sola instancia.',
    );
  }

  onModuleInit(): void {
    this.assertPollingIsSafe();

    // El bot central manda tanto como los dedicados: avisos a jefes, ofertas a
    // choferes y los barridos periodicos salen todos por aqui.
    installSendThrottle(this.centralBot, 'central');

    /*
     * Los bots dedicados se levantan FUERA del arranque, a proposito.
     *
     * Nest espera a que terminen todos los `onModuleInit` antes de dar la
     * aplicacion por iniciada, y nestjs-telegraf lanza el bot central en su
     * propio hook. Si aqui se esperaba a `getMe()` de cada bot dedicado —una
     * llamada de red, en serie, sin limite de tiempo— un solo token colgado o
     * un 429 de Telegram por ráfaga bastaba para detener el arranque entero y
     * dejar sin lanzar tambien al central: ningun bot respondia y desde fuera
     * parecia que los clientes habian dejado de escribir.
     */
    void this.arrancarBotsDedicados();
  }

  private async arrancarBotsDedicados(): Promise<void> {
    let records: EmployeeTelegramBot[];
    try {
      records = await this.botsRepository.find({
        where: [
          { status: 'activo' },
          { status: 'pendiente' },
          { status: 'error' },
        ],
      });
    } catch (error: unknown) {
      // El backend puede levantar antes de que corra la migración. Sin la
      // tabla no hay bots dedicados y todo sigue por el bot central.
      this.logger.warn(
        `No se pudo leer la tabla de bots dedicados, se sigue solo con el bot central: ${String(error)}`,
      );
      return;
    }
    if (!records.length) return;

    this.logger.log(
      `Levantando ${records.length} bot(s) dedicados por ${this.usesWebhooks ? 'webhook' : 'long polling'}.`,
    );
    let arriba = 0;
    const caidos: string[] = [];
    for (const record of records) {
      try {
        await this.startBot(record);
        arriba += 1;
      } catch (error: unknown) {
        caidos.push(record.employeeId);
        this.logger.error(
          `No se pudo levantar el bot de la empleada ${record.employeeId}: ${String(error)}`,
        );
      }
    }

    /*
     * Resumen en una linea. Cada fallo ya se registro por separado, pero el
     * recuento es lo que permite ver de un vistazo que el problema es general
     * —todos caidos, apunta a configuracion o a Telegram— y no de un token
     * suelto. Un bot caido devuelve su enlace del catalogo al bot central.
     */
    if (caidos.length) {
      this.logger.error(
        `Bots dedicados: ${arriba} arriba, ${caidos.length} caidos. Los caidos ` +
          'atenderan por el bot central hasta que arranquen.',
      );
    } else {
      this.logger.log(`Bots dedicados: ${arriba} arriba, ninguno caido.`);
    }
  }

  onModuleDestroy(): void {
    for (const registered of this.byEmployee.values()) {
      try {
        registered.bot.stop('SIGTERM');
      } catch {
        // Un bot que nunca llegó a arrancar no tiene nada que detener.
      }
    }
    this.byEmployee.clear();
    this.byRecord.clear();
  }

  /**
   * Crea la instancia de Telegraf de una empleada y le enchufa el middleware
   * compuesto del bot central. Así todos los `@Update()` que ya existen
   * responden igual en el bot dedicado, sin duplicar una sola línea de lógica.
   */
  private buildBot(
    record: EmployeeTelegramBot,
    token: string,
  ): Telegraf<Context> {
    const bot = new Telegraf<Context>(token);
    installSendThrottle(bot, `empleada:${record.employeeId}`);

    bot.use((ctx: DedicatedBotContext, next) => {
      ctx.dedicatedBotEmployeeId = record.employeeId;
      ctx.dedicatedBotId = record.botId ?? undefined;
      // Se resuelve el middleware del central en cada update (y no una sola vez
      // al arrancar) para que incluya siempre la cadena completa de handlers,
      // sin depender del orden de inicialización de los módulos de Nest.
      return this.centralBot.middleware()(ctx, next);
    });

    bot.catch((error: unknown, ctx: Context) => {
      this.logger.error(
        `Error en el bot de la empleada ${record.employeeId}: ${String(error)}`,
      );
      void ctx
        .reply(
          'Ocurrió un error inesperado al procesar tu solicitud. Por favor, intenta de nuevo.',
        )
        .catch(() => undefined);
    });

    return bot;
  }

  private async startBot(record: EmployeeTelegramBot): Promise<void> {
    if (this.byEmployee.has(record.employeeId)) {
      await this.stopBot(record.employeeId);
    }

    const token = this.crypto.decrypt(record.tokenCiphertext);
    const bot = this.buildBot(record, token);

    try {
      // Con limite de tiempo: `getMe` no lo trae, y sin el un token que no
      // responde deja colgado el arranque del resto de los bots.
      const me = await conLimiteDeTiempo(
        bot.telegram.getMe(),
        GETME_TIMEOUT_MS,
        `getMe del bot de la empleada ${record.employeeId}`,
      );
      bot.botInfo = me;

      if (this.usesWebhooks) {
        await bot.telegram.setWebhook(
          `${this.webhookBaseUrl}/telegram/webhook/${record.id}`,
          { secret_token: record.webhookSecret },
        );
      } else {
        // `launch()` en modo polling no resuelve hasta que el bot se detiene.
        void bot.launch().catch((error: unknown) => {
          this.logger.error(
            `Polling caído para la empleada ${record.employeeId}: ${String(error)}`,
          );
        });
      }

      const registered: RegisteredBot = {
        recordId: record.id,
        employeeId: record.employeeId,
        bot,
      };
      this.byEmployee.set(record.employeeId, registered);
      this.byRecord.set(record.id, registered);

      await this.botsRepository.update(record.id, {
        status: 'activo',
        lastError: null,
        botId: String(me.id),
        botUsername: me.username ?? null,
      });
      this.logger.log(
        `Bot @${me.username ?? me.id} activo para la empleada ${record.employeeId}.`,
      );
    } catch (error: unknown) {
      const message = describeError(error);
      // El usuario del bot no se borra al fallar el arranque: es un dato de
      // identidad, no de estado. Conservarlo permite que el enlace del catálogo
      // siga apuntando a la modelo correcta mientras se resuelve la caída.
      await this.botsRepository.update(record.id, {
        status: 'error',
        lastError: message.slice(0, 500),
      });
      throw error;
    }
  }

  private async stopBot(employeeId: string): Promise<void> {
    const registered = this.byEmployee.get(employeeId);
    if (!registered) return;
    try {
      if (this.usesWebhooks) {
        await registered.bot.telegram.deleteWebhook().catch(() => undefined);
      }
      registered.bot.stop('SIGTERM');
    } catch {
      // Detener un bot que nunca arrancó no es un error que valga la pena propagar.
    }
    this.byEmployee.delete(employeeId);
    this.byRecord.delete(registered.recordId);
  }

  /**
   * Guarda (o reemplaza) el token de una empleada y levanta su bot en caliente,
   * sin reiniciar el backend.
   */
  async setToken(
    employeeId: string,
    token: string,
  ): Promise<EmployeeTelegramBot> {
    const trimmed = token.trim();
    if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(trimmed)) {
      throw new BadRequestException(
        'El token no tiene el formato de un token de bot de Telegram.',
      );
    }

    const duplicate = await this.botsRepository
      .createQueryBuilder('bot')
      .where('bot.bot_id = :botId', { botId: trimmed.split(':')[0] })
      .andWhere('bot.employee_id != :employeeId', { employeeId })
      .getOne();
    if (duplicate) {
      throw new BadRequestException(
        'Ese bot ya está asignado a otra modelo. Cada modelo necesita su propio bot.',
      );
    }

    const existing = await this.botsRepository.findOne({
      where: { employeeId },
    });
    const record = await this.botsRepository.save({
      ...(existing ?? {}),
      employeeId,
      tokenCiphertext: this.crypto.encrypt(trimmed),
      tokenHint: this.crypto.hintFor(trimmed),
      webhookSecret: existing?.webhookSecret ?? this.crypto.newWebhookSecret(),
      status: 'pendiente',
      lastError: null,
    });

    await this.startBot(record);
    return this.botsRepository.findOneOrFail({ where: { id: record.id } });
  }

  /** Borra el bot de una empleada y lo apaga. */
  async removeToken(employeeId: string): Promise<void> {
    await this.stopBot(employeeId);
    await this.botsRepository.delete({ employeeId });
  }

  /** Bot dedicado de la empleada, o `null` si todavía no tiene uno activo. */
  botForEmployee(
    employeeId: string | null | undefined,
  ): Telegraf<Context> | null {
    if (!employeeId) return null;
    return this.byEmployee.get(employeeId)?.bot ?? null;
  }

  /** Bot dedicado si existe; si no, el central. Es el fallback por defecto. */
  botForEmployeeOrCentral(
    employeeId: string | null | undefined,
  ): Telegraf<Context> {
    return this.botForEmployee(employeeId) ?? this.centralBot;
  }

  get central(): Telegraf<Context> {
    return this.centralBot;
  }

  /** Entrega un update entrante por webhook al bot que corresponde. */
  async handleWebhookUpdate(
    recordId: string,
    secret: string | undefined,
    update: Update,
  ): Promise<boolean> {
    const registered = this.byRecord.get(recordId);
    if (!registered) return false;
    const record = await this.botsRepository.findOne({
      where: { id: recordId },
      select: { id: true, webhookSecret: true },
    });
    if (!record || !secret || secret !== record.webhookSecret) return false;
    await registered.bot.handleUpdate(update);
    return true;
  }
}
