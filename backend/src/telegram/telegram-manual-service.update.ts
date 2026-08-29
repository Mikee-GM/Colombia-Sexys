import { Logger } from '@nestjs/common';
import { Action, Ctx, Hears, Update } from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuarios } from '../users/entities/user.entity';
import { ManualServicesService } from '../manual-services/manual-services.service';
import { TelegramManualServiceWizard } from './telegram-manual-service.wizard';
import { TelegramCallbackGuard } from './telegram-callback-guard';

/**
 * Botones del registro de un servicio hecho fuera del sistema: los de la
 * empleada mientras rellena el formulario y los del jefe al resolverlo.
 *
 * El texto libre no se atiende aqui: lo despacha el manejador de mensajes del
 * cliente llamando al asistente, para no depender del orden en que Nest
 * registre los `@Update()`.
 */
@Update()
export class TelegramManualServiceUpdate {
  private readonly logger = new Logger(TelegramManualServiceUpdate.name);

  constructor(
    @InjectRepository(Usuarios)
    private readonly usuarios: Repository<Usuarios>,
    private readonly wizard: TelegramManualServiceWizard,
    private readonly manualServices: ManualServicesService,
    private readonly callbackGuard: TelegramCallbackGuard,
  ) {}

  @Hears(['/registrar_servicio', 'Registrar servicio pasado'])
  async onIniciar(@Ctx() ctx: Context) {
    await this.wizard.iniciar(ctx);
  }

  @Action('rm_cancelar')
  async onCancelar(@Ctx() ctx: Context) {
    await ctx.answerCbQuery();
    await this.wizard.cancelar(ctx);
  }

  @Action(/^rm_fecha:(hoy|ayer|otra)$/)
  async onFecha(@Ctx() ctx: Context) {
    await ctx.answerCbQuery();
    await this.wizard.elegirFecha(ctx, (ctx as any).match[1]);
  }

  @Action(/^rm_dur:(\d+)$/)
  async onDuracion(@Ctx() ctx: Context) {
    await ctx.answerCbQuery();
    await this.wizard.elegirDuracion(ctx, Number((ctx as any).match[1]));
  }

  @Action(/^rm_cli:(buscar|libre|anonimo)$/)
  async onModoCliente(@Ctx() ctx: Context) {
    await ctx.answerCbQuery();
    await this.wizard.elegirModoCliente(ctx, (ctx as any).match[1]);
  }

  @Action(/^rm_cli_sel:(.+)$/)
  async onClienteElegido(@Ctx() ctx: Context) {
    await ctx.answerCbQuery();
    await this.wizard.elegirCliente(ctx, (ctx as any).match[1]);
  }

  @Action(/^rm_pago:(efectivo|tarjeta|transferencia)$/)
  async onPago(@Ctx() ctx: Context) {
    await ctx.answerCbQuery();
    await this.wizard.elegirPago(ctx, (ctx as any).match[1]);
  }

  @Action(/^rm_lugar:(.+)$/)
  async onLugar(@Ctx() ctx: Context) {
    await ctx.answerCbQuery();
    await this.wizard.elegirUbicacion(ctx, (ctx as any).match[1]);
  }

  @Action('rm_enviar')
  async onEnviar(@Ctx() ctx: Context) {
    // Crea la solicitud: no puede ejecutarse dos veces por un doble toque.
    if (await this.callbackGuard.esRepetido(ctx)) return;
    await ctx.answerCbQuery();
    await this.wizard.enviar(ctx);
  }

  /**
   * El jefe resuelve. Autorizar crea el servicio, asi que va protegido contra
   * la pulsacion repetida por partida doble: el guardia de botones y la
   * transicion condicionada de la propia solicitud.
   */
  @Action(/^rm_jefe:(ok|no):(.+)$/)
  async onResolver(@Ctx() ctx: Context) {
    if (await this.callbackGuard.esRepetido(ctx)) return;
    const match = (ctx as any).match;
    const aprobar = match[1] === 'ok';
    const solicitudId = match[2];

    const telegramId = ctx.from?.id?.toString();
    const actor = telegramId
      ? await this.usuarios.findOne({ where: { telegramChatId: telegramId } })
      : null;
    if (!actor || (actor.rol !== 'jefe' && actor.rol !== 'admin')) {
      this.callbackGuard.liberar(ctx);
      await ctx.answerCbQuery('No tienes permisos para resolver esto.', {
        show_alert: true,
      });
      return;
    }

    if (!aprobar) {
      /*
       * El rechazo pide un motivo porque es lo unico que la empleada va a
       * recibir. Se resuelve con un comando en vez de con un paso de sesion:
       * el jefe puede estar resolviendo varias desde el grupo a la vez, y una
       * sesion de "estoy escribiendo el motivo" se confundiria entre ellas.
       */
      await ctx.answerCbQuery();
      await ctx.reply(
        `Para rechazarlo, escribe el motivo así:\n/rechazar_registro ${solicitudId} el motivo`,
      );
      return;
    }

    try {
      const solicitud = await this.manualServices.aprobar(
        solicitudId,
        actor.id,
      );
      await ctx.answerCbQuery('Servicio registrado.');
      await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
      await ctx.reply(
        `Autorizado. El servicio quedó registrado por $${Number(solicitud.montoCobrado).toFixed(2)} y ya cuenta en su corte.`,
      );
      await this.wizard.avisarResolucionAEmpleada(solicitud);
    } catch (error: any) {
      this.callbackGuard.liberar(ctx);
      await ctx.answerCbQuery(error?.message || 'No se pudo autorizar.', {
        show_alert: true,
      });
    }
  }

  @Hears(/^\/rechazar_registro\s+([0-9a-f-]{36})\s+([\s\S]{3,1000})$/i)
  async onRechazarConMotivo(@Ctx() ctx: Context) {
    const match = (ctx as any).match;
    const telegramId = ctx.from?.id?.toString();
    const actor = telegramId
      ? await this.usuarios.findOne({ where: { telegramChatId: telegramId } })
      : null;
    if (!actor || (actor.rol !== 'jefe' && actor.rol !== 'admin')) {
      await ctx.reply('No tienes permisos para resolver esto.');
      return;
    }

    try {
      const solicitud = await this.manualServices.rechazar(
        match[1],
        actor.id,
        match[2],
      );
      await ctx.reply('Rechazado. Ya se lo dije a la empleada.');
      await this.wizard.avisarResolucionAEmpleada(solicitud);
    } catch (error: any) {
      await ctx.reply(error?.message || 'No se pudo rechazar.');
    }
  }

  /** Atajo para que el jefe vea lo que tiene pendiente de autorizar. */
  @Hears('/registros_pendientes')
  async onPendientes(@Ctx() ctx: Context) {
    const telegramId = ctx.from?.id?.toString();
    const actor = telegramId
      ? await this.usuarios.findOne({ where: { telegramChatId: telegramId } })
      : null;
    if (!actor || (actor.rol !== 'jefe' && actor.rol !== 'admin')) return;

    const pendientes = await this.manualServices.listar(actor, 'pendiente');
    if (!pendientes.length) {
      await ctx.reply('No tienes registros pendientes de autorizar.');
      return;
    }

    for (const solicitud of pendientes.slice(0, 10)) {
      await ctx.reply(
        [
          `${solicitud.empleada?.nombreArtistico ?? 'Empleada'} · $${Number(solicitud.montoCobrado).toFixed(2)}`,
          `Cliente: ${solicitud.cliente?.nombreTelegram ?? solicitud.clienteNombreLibre ?? 'Sin identificar'}`,
          `Motivo: ${solicitud.motivo}`,
        ].join('\n'),
        Markup.inlineKeyboard([
          [
            Markup.button.callback('Autorizar', `rm_jefe:ok:${solicitud.id}`),
            Markup.button.callback('Rechazar', `rm_jefe:no:${solicitud.id}`),
          ],
        ]),
      );
    }
  }
}
