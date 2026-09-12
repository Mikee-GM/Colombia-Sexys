import { Inject, Logger, forwardRef } from '@nestjs/common';
import { Action, Ctx, Update } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuarios } from '../users/entities/user.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { TeamChannelService } from '../team-channel/team-channel.service';
import { TelegramCallbackGuard } from './telegram-callback-guard';
import type { TelegramSessionData } from './telegram-booking.update';

type CtxCanal = Context & { session?: TelegramSessionData };

/** Una respuesta a medias deja de esperarse pasado este tiempo. */
const TTL_RESPUESTA_MS = 30 * 60 * 1000;

/**
 * Lado de Telegram del canal entre la modelo y quien la coordina.
 *
 * Los botones viven aqui --un `@Action` se reparte por el dato del boton, asi
 * que no compite con nadie-- pero el texto libre NO tiene su propio
 * `@On('text')`: el manejador de mensajes del cliente atrapa todo lo que llega
 * al bot y cual de los dos corriera antes dependeria del orden en que Nest
 * instancia los `@Update()`. En su lugar ese manejador llama a `manejarTexto`,
 * igual que hace con el formulario de registro manual.
 */
@Update()
export class TelegramTeamChannelUpdate {
  private readonly logger = new Logger(TelegramTeamChannelUpdate.name);

  constructor(
    @Inject(forwardRef(() => TeamChannelService))
    private readonly teamChannel: TeamChannelService,
    @InjectRepository(Usuarios)
    private readonly usuarios: Repository<Usuarios>,
    @InjectRepository(Empleadas)
    private readonly empleadas: Repository<Empleadas>,
    private readonly callbackGuard: TelegramCallbackGuard,
  ) {}

  /** El jefe contesta a una modelo. */
  @Action(/^canal_jefe:(.+)$/)
  async onResponderJefe(@Ctx() ctx: CtxCanal) {
    if (await this.callbackGuard.esRepetido(ctx)) return;
    const empleadaId = (ctx as any).match?.[1] as string | undefined;
    if (!empleadaId) return;

    const actor = await this.actor(ctx);
    if (!actor || (actor.rol !== 'jefe' && actor.rol !== 'admin')) {
      await ctx.answerCbQuery('No tienes permisos para responder aquí.', {
        show_alert: true,
      });
      return;
    }

    ctx.session ??= {};
    ctx.session.canalEquipo = {
      empleadaId,
      lado: 'jefe',
      startedAt: Date.now(),
    };
    await ctx.answerCbQuery();
    await ctx.reply('Escribe tu respuesta y se la hago llegar.');
  }

  /** La modelo contesta a coordinacion. */
  @Action(/^canal_emp:(.+)$/)
  async onResponderEmpleada(@Ctx() ctx: CtxCanal) {
    if (await this.callbackGuard.esRepetido(ctx)) return;
    const empleadaId = (ctx as any).match?.[1] as string | undefined;
    if (!empleadaId) return;

    const empleada = await this.empleadaDelChat(ctx);
    if (!empleada || empleada.id !== empleadaId) {
      await ctx.answerCbQuery('Esta conversación no es tuya.', {
        show_alert: true,
      });
      return;
    }

    ctx.session ??= {};
    ctx.session.canalEquipo = {
      empleadaId,
      lado: 'empleada',
      startedAt: Date.now(),
    };
    await ctx.answerCbQuery();
    await ctx.reply('Escribe tu mensaje y lo mando a coordinación.');
  }

  /**
   * El jefe pregunta por que cerro su jornada.
   *
   * El boton viaja en el aviso de cierre de jornada, que es el momento en que
   * se lo pregunta. La respuesta vuelve por el canal, no por este mensaje.
   */
  @Action(/^jornada_motivo:(.+)$/)
  async onPreguntarMotivoJornada(@Ctx() ctx: CtxCanal) {
    if (await this.callbackGuard.esRepetido(ctx)) return;
    const empleadaId = (ctx as any).match?.[1] as string | undefined;
    if (!empleadaId) return;

    const actor = await this.actor(ctx);
    if (!actor || (actor.rol !== 'jefe' && actor.rol !== 'admin')) {
      await ctx.answerCbQuery('No tienes permisos para preguntar esto.', {
        show_alert: true,
      });
      return;
    }

    try {
      await this.teamChannel.preguntarMotivoDeJornada(actor, empleadaId);
      await ctx.answerCbQuery('Se lo pregunté. Te aviso en cuanto responda.');
    } catch (error: any) {
      await ctx.answerCbQuery(error?.message || 'No se pudo preguntar', {
        show_alert: true,
      });
    }
  }

  /**
   * Texto libre que va al canal, si es que se estaba esperando uno.
   *
   * Devuelve true cuando el mensaje era para el canal, para que quien lo cede
   * no lo procese ademas por su cuenta.
   */
  async manejarTexto(ctx: CtxCanal): Promise<boolean> {
    const pendiente = ctx.session?.canalEquipo;
    if (!pendiente) return false;

    if (Date.now() - pendiente.startedAt > TTL_RESPUESTA_MS) {
      ctx.session!.canalEquipo = undefined;
      return false;
    }

    const texto = ((ctx.message as { text?: string })?.text || '').trim();
    if (!texto) return false;
    // Un comando no es una respuesta: quien escribe "/portal" quiere el portal,
    // no mandarle la palabra a nadie.
    if (texto.startsWith('/')) {
      ctx.session!.canalEquipo = undefined;
      return false;
    }

    ctx.session!.canalEquipo = undefined;

    try {
      if (pendiente.lado === 'jefe') {
        const actor = await this.actor(ctx);
        if (!actor) return false;
        await this.teamChannel.enviarDesdeJefe(
          actor,
          pendiente.empleadaId,
          texto,
        );
        await ctx.reply('Mensaje enviado.');
        return true;
      }

      const empleada = await this.empleadaDelChat(ctx);
      if (!empleada || empleada.id !== pendiente.empleadaId) return false;
      await this.teamChannel.enviarDesdeEmpleada(empleada.usuarioId, texto);
      await ctx.reply('Listo, ya lo mandé a coordinación.');
      return true;
    } catch (error) {
      this.logger.error('No se pudo enviar el mensaje del canal:', error);
      await ctx.reply(
        'No pude enviar tu mensaje. Inténtalo otra vez en un momento.',
      );
      return true;
    }
  }

  private async actor(ctx: Context): Promise<Usuarios | null> {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return null;
    return this.usuarios.findOne({ where: { telegramChatId: telegramId } });
  }

  private async empleadaDelChat(ctx: Context): Promise<Empleadas | null> {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return null;
    return this.empleadas.findOne({
      where: { usuario: { telegramChatId: telegramId, rol: 'empleada' } },
      relations: { usuario: true },
    });
  }
}
