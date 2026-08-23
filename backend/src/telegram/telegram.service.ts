import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { Telegraf, Context, Markup } from 'telegraf';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuarios } from '../users/entities/user.entity';
import { Servicios } from '../services/entities/service.entity';
import { JwtService } from '@nestjs/jwt';
import { TelegramBotRegistryService } from './telegram-bot-registry.service';

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
  ): Promise<void> {
    const bot = employeeId
      ? this.botRegistry.botForEmployeeOrCentral(employeeId)
      : this.bot;
    await bot.telegram.sendMessage(telegramId, message);
  }

  /**
   * Notifica a todos los Jefes y Admins de un nuevo servicio creado.
   */
  async notifyJefesNewService(serviceId: string): Promise<void> {
    // Las notificaciones para jefes e independientes ahora se manejan exclusivamente a través de los temas (forum topics) en sus grupos de Telegram
  }
}
