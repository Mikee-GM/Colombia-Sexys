import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context, Markup } from 'telegraf';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuarios } from '../users/entities/user.entity';
import { Servicios } from '../services/entities/service.entity';
import { JwtService } from '@nestjs/jwt';
import type { InlineKeyboardButton } from 'telegraf/types';
import { TelegramBotRegistryService } from './telegram-bot-registry.service';

/**
 * Extras de un envio programatico.
 *
 * Nacen de tener que colgar el boton del portal de los avisos que ya se
 * mandaban: sin esto, cada llamador tendria que alcanzar el bot por su cuenta
 * y se perderia el enrutado por bot dedicado de cada modelo.
 */
export type SendMessageOptions = {
  parseMode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  buttons?: InlineKeyboardButton[][];
};

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    @InjectRepository(Servicios)
    private readonly serviciosRepository: Repository<Servicios>,
    private readonly jwtService: JwtService,
    private readonly botRegistry: TelegramBotRegistryService,
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

  /**
   * Envia un mensaje programático a un usuario por su ID de Telegram.
   * @param telegramId El ID de Telegram del usuario (como string bigint).
   * @param message El mensaje a enviar.
   * @param employeeId Si el destinatario es una empleada, su id: el mensaje
   *   sale por el bot propio de ella. Sin esto (choferes, jefes, admin) se usa
   *   el bot central.
   */
  async sendMessage(
    telegramId: string,
    message: string,
    employeeId?: string | null,
    options?: SendMessageOptions,
  ): Promise<void> {
    const bot = employeeId
      ? this.botRegistry.botForEmployeeOrCentral(employeeId)
      : this.bot;
    await bot.telegram.sendMessage(telegramId, message, {
      ...(options?.parseMode ? { parse_mode: options.parseMode } : {}),
      ...(options?.buttons?.length
        ? Markup.inlineKeyboard(options.buttons)
        : {}),
    });
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
