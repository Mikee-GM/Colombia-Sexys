import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context, Markup } from 'telegraf';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuarios } from '../users/entities/user.entity';
import { Servicios } from '../services/entities/service.entity';
import { JwtService } from '@nestjs/jwt';
import type { InlineKeyboardButton, Message } from 'telegraf/types';
import { installSendThrottle } from './telegram-send-throttle';

/**
 * Extras de un envio programatico.
 *
 * Nacen de tener que colgar el boton del portal de los avisos que ya se
 * mandaban: sin esto, cada llamador tendria que alcanzar el bot por su cuenta.
 */
export type SendMessageOptions = {
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  buttons?: InlineKeyboardButton[][];
  /**
   * Tema del grupo al que va el mensaje.
   *
   * Los avisos al jefe viven en el tema de su servicio; sin esto habia que
   * alcanzar el bot por fuera para poder pasarlo, que es justo lo que este
   * servicio existe para evitar.
   */
  threadId?: number;
};

@Injectable()
export class TelegramService implements OnModuleInit {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    @InjectRepository(Servicios)
    private readonly serviciosRepository: Repository<Servicios>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    if (this.bot && typeof this.bot.catch === 'function') {
      this.bot.catch((err: any, ctx: Context) => {
        this.logger.error('Global Telegram Bot Error:', err);
        ctx
          .reply(
            'Ocurrió un error inesperado al procesar tu solicitud. Por favor, intenta de nuevo.',
          )
          .catch((e: any) =>
            this.logger.error('Failed to send error notification:', e),
          );
      });
    }
  }

  onModuleInit(): void {
    this.assertPollingIsSafe();
    // Todo lo que sale del sistema pasa por este bot: avisos a jefes, ofertas a
    // choferes, mensajes a clientes y los barridos periodicos.
    installSendThrottle(this.bot, 'central');
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
    const webhookBaseUrl = this.configService
      .get<string>('TELEGRAM_WEBHOOK_BASE_URL', '')
      .trim();
    if (instances <= 1 || webhookBaseUrl.length > 0) return;

    throw new Error(
      `APP_INSTANCE_COUNT=${instances} con long polling: Telegram solo admite un proceso ` +
        'haciendo getUpdates por token, así que las demás réplicas dejarían de recibir ' +
        'mensajes. Define TELEGRAM_WEBHOOK_BASE_URL (y habilita el bloque de webhook en ' +
        'nginx) o vuelve a una sola instancia.',
    );
  }

  /**
   * Envia un mensaje programático a un usuario por su ID de Telegram.
   * @param telegramId El ID de Telegram del usuario (como string bigint).
   * @param message El mensaje a enviar.
   */
  async sendMessage(
    telegramId: string,
    message: string,
    options?: SendMessageOptions,
  ): Promise<Message.TextMessage> {
    // Devuelve el mensaje enviado: hay avisos cuyo id hay que guardar para
    // poder borrarlos o editarlos despues. Quien no lo necesite lo ignora.
    return this.bot.telegram.sendMessage(telegramId, message, {
      ...(options?.parseMode ? { parse_mode: options.parseMode } : {}),
      ...(options?.threadId ? { message_thread_id: options.threadId } : {}),
      ...(options?.buttons?.length
        ? Markup.inlineKeyboard(options.buttons)
        : {}),
    });
  }

  /**
   * Borra un mensaje que el bot mando antes.
   *
   * Se usa para retirar avisos que dejaron de ser ciertos --el "tu chofer va
   * en camino" cuando ya subio al coche-- y no lanza si falla: el mensaje pudo
   * borrarlo el usuario, o ser mas viejo de lo que Telegram deja retirar, y
   * ninguna de las dos cosas debe tumbar la operacion que lo pidio.
   */
  async deleteMessage(chatId: string, messageId: number): Promise<void> {
    try {
      await this.bot.telegram.deleteMessage(chatId, messageId);
    } catch (error: unknown) {
      this.logger.warn(
        `No se pudo borrar el mensaje ${messageId} de ${chatId}: ${String(error)}`,
      );
    }
  }

  /**
   * Avisa al jefe, por Telegram, de un servicio que espera su autorizacion.
   *
   * El mensaje lleva los botones que ya maneja `jefe_autorizar`, asi que el
   * jefe acepta o rechaza desde el propio grupo sin abrir el panel. Estaba
   * vacio: se dio por hecho que bastaba con el tema del grupo, y el resultado
   * era que por el panel se autorizaba bien y por Telegram no llegaba nada.
   *
   * Sale siempre por el bot central: el grupo del jefe es suyo, y el bot
   * dedicado de una modelo no es miembro de ese grupo.
   */
  async notifyJefesNewService(serviceId: string): Promise<void> {
    const servicio = await this.serviciosRepository.findOne({
      where: { id: serviceId },
      relations: { cliente: true, empleada: true, jefe: true },
    });
    if (!servicio) return;

    // Grupo del jefe si lo tiene; si no, su chat privado. Sin ninguno de los
    // dos no hay a donde avisar y se deja constancia, porque ese servicio se
    // queda esperando a que alguien mire el panel.
    const destino =
      servicio.jefe?.grupoTelegramId || servicio.jefe?.telegramChatId;
    if (!destino) {
      this.logger.warn(
        `Servicio ${serviceId}: el jefe no tiene grupo ni chat de Telegram, no se pudo avisar.`,
      );
      return;
    }

    const duracion = servicio.duracionIndefinida
      ? 'indefinida (se cobra al terminar)'
      : `${servicio.duracionPactadaHoras} hora(s)`;
    const lugar =
      servicio.locationNameSnapshot ||
      (servicio.ubicacionClienteLat
        ? 'Ubicacion enviada por el cliente'
        : 'Sin definir');
    const cita = servicio.fechaProgramada
      ? new Date(servicio.fechaProgramada).toLocaleString('es-MX', {
          timeZone: 'America/Mexico_City',
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : 'Para ahora';

    const texto =
      `🔔 *Servicio pendiente de autorizar*\n\n` +
      `• *Empleada:* ${servicio.empleada?.nombreArtistico || 'Sin asignar'}\n` +
      `• *Cliente:* ${servicio.cliente?.nombreTelegram || 'Desconocido'}\n` +
      `• *Duracion:* ${duracion}\n` +
      `• *Metodo de pago:* ${(servicio.metodoPago || 'sin definir').toUpperCase()}\n` +
      `• *Lugar:* ${lugar}\n` +
      `• *Cita:* ${cita}\n` +
      `• *Total:* $${Number(servicio.totalFinal || 0).toLocaleString('es-MX')}\n\n` +
      `Autoriza o rechaza desde aqui mismo.`;

    const threadId = servicio.telegramThreadId
      ? Number(servicio.telegramThreadId)
      : undefined;

    try {
      await this.bot.telegram.sendMessage(destino, texto, {
        parse_mode: 'Markdown',
        ...(threadId ? { message_thread_id: threadId } : {}),
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('Aceptar', `jefe_autorizar:${serviceId}:1`),
            Markup.button.callback('Rechazar', `jefe_autorizar:${serviceId}:0`),
          ],
        ]),
      });
    } catch (error: unknown) {
      /*
       * Si el tema del grupo ya no existe, Telegram rechaza el envio entero.
       * Se reintenta sin tema antes de rendirse: es preferible que el aviso
       * caiga en el grupo general a que el servicio se quede sin autorizar.
       */
      this.logger.warn(
        `Servicio ${serviceId}: fallo el aviso al jefe (${String(error)}); se reintenta sin tema.`,
      );
      try {
        await this.bot.telegram.sendMessage(destino, texto, {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                'Aceptar',
                `jefe_autorizar:${serviceId}:1`,
              ),
              Markup.button.callback(
                'Rechazar',
                `jefe_autorizar:${serviceId}:0`,
              ),
            ],
          ]),
        });
      } catch (retryError: unknown) {
        this.logger.error(
          `Servicio ${serviceId}: no se pudo avisar al jefe por Telegram: ${String(retryError)}`,
        );
      }
    }
  }
}
