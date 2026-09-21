import { Inject, forwardRef, Logger } from '@nestjs/common';
import {
  Update,
  Ctx,
  Action,
  Hears,
  Command,
  InjectBot,
  On,
} from 'nestjs-telegraf';
import { Context, Markup, Telegraf } from 'telegraf';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Usuarios } from '../users/entities/user.entity';
import { Servicios } from '../services/entities/service.entity';
import { Clientes } from '../clients/entities/client.entity';
import { ConversacionesTelegram } from '../telegram-conversations/entities/telegram-conversation.entity';
import { DisciplineService } from '../discipline/discipline.service';
import { ServicesService } from '../services/services.service';
import type { TelegramSessionData } from './telegram-booking.update';
import { TelegramCallbackGuard } from './telegram-callback-guard';
import { TelegramSession } from './entities/telegram-session.entity';
import { parseSessionKey } from './telegram-session.key';

/**
 * Lo que se le dice al jefe cuando el Uber queda retenido.
 *
 * No es un fallo ni una demora del sistema: es el paso que se metio a proposito
 * entre autorizar y pedir el coche, y hay que decirlo con esas palabras para
 * que no lo lea como que algo se atasco.
 */
const ESPERANDO_ALISTADO =
  'El Uber se pide cuando ella avise que está lista. Te llega el enlace en ese momento.';

/** El jefe tambien tiene sesion de Telegram; aqui solo interesa una clave. */
type BossContext = Context & { session?: TelegramSessionData };

@Update()
export class TelegramAdminUpdate {
  private readonly logger = new Logger(TelegramAdminUpdate.name);

  /** Canal admin activo: el telegramId del cliente al que se le envían mensajes directos. */
  private activeAdminChat: string | null = null;

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    @InjectRepository(Servicios)
    private readonly serviciosRepository: Repository<Servicios>,
    @Inject(forwardRef(() => ServicesService))
    private readonly servicesService: ServicesService,
    private readonly callbackGuard: TelegramCallbackGuard,
    @InjectRepository(Clientes)
    private readonly clientesRepository: Repository<Clientes>,
    private readonly discipline: DisciplineService,
    @InjectRepository(TelegramSession)
    private readonly telegramSessionRepository: Repository<TelegramSession>,
    @InjectRepository(ConversacionesTelegram)
    private readonly conversationsRepository: Repository<ConversacionesTelegram>,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Notas del jefe a medio escribir, guardadas en su sesion de Telegram.
   *
   * Antes eran un Map en la memoria del proceso: con dos replicas, empezar la
   * nota en una y terminarla en otra perdia el flujo sin decir nada, y nada
   * purgaba las entradas abandonadas. La sesion ya persiste en la base y ya
   * caduca sola.
   */
  private pendingNotes(
    ctx: Context,
  ): Record<
    string,
    { notes: string; sameLocation: boolean; startedAt: number }
  > {
    const session = (ctx as BossContext).session;
    if (!session) return {};
    session.pendingBossNotes ??= {};
    return session.pendingBossNotes;
  }

  /** Una nota sin terminar deja de valer pasado este tiempo. */
  private static readonly NOTES_TTL_MS = 30 * 60 * 1000;

  private readNote(ctx: Context, serviceId: string) {
    const pending = this.pendingNotes(ctx)[serviceId];
    if (!pending) return undefined;
    if (Date.now() - pending.startedAt > TelegramAdminUpdate.NOTES_TTL_MS) {
      delete this.pendingNotes(ctx)[serviceId];
      return undefined;
    }
    return pending;
  }

  @Action(/^jefe_autorizar:(.+):([01])$/)
  async onJefeAutorizar(@Ctx() ctx: Context) {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const user = await this.usuariosRepository.findOne({
      where: { telegramChatId: telegramId },
    });

    if (!user) {
      await ctx.answerCbQuery(
        '❌ No tienes permisos para realizar esta acción.',
        { show_alert: true },
      );
      return;
    }

    const match = (ctx as any).match;
    const serviceId = match[1];
    const accept = match[2] === '1';

    // El servicio se carga para pintar el resumen y decidir la botonera.
    const servicio = await this.serviciosRepository.findOne({
      where: { id: serviceId },
      relations: { empleada: true, cliente: true },
    });

    if (!servicio) {
      await ctx.answerCbQuery('❌ Servicio no encontrado.', {
        show_alert: true,
      });
      return;
    }

    if (user.rol !== 'jefe' && user.rol !== 'admin') {
      await ctx.answerCbQuery(
        '❌ No tienes permisos para autorizar este servicio.',
        { show_alert: true },
      );
      return;
    }

    await ctx.answerCbQuery();

    const originalText = (ctx.callbackQuery?.message as any)?.text || '';
    // Evitar duplicar la advertencia
    if (originalText.includes('⚠️ ¿Confirmas')) {
      return;
    }

    const warnHeader = `⚠️ *¿Confirmas que deseas ${accept ? 'ACEPTAR' : 'RECHAZAR'} este servicio?*\n\n`;
    const previous = servicio.servicioPrevioId
      ? await this.serviciosRepository.findOneBy({
          id: servicio.servicioPrevioId,
        })
      : null;
    const samePresetLocation = Boolean(
      previous?.presetLocationId &&
      previous.presetLocationId === servicio.presetLocationId,
    );

    const keyboardButtons = accept
      ? [
          [
            ...(samePresetLocation
              ? [
                  Markup.button.callback(
                    'Sin notas, misma ubicación',
                    `conf_ja:${serviceId}:1:same`,
                  ),
                ]
              : [
                  Markup.button.callback(
                    'Sin notas, Chofer',
                    `conf_ja:${serviceId}:1:chofer`,
                  ),
                  Markup.button.callback(
                    'Sin notas, Uber',
                    `conf_ja:${serviceId}:1:uber`,
                  ),
                ]),
          ],
          [
            Markup.button.callback(
              'Agregar notas',
              `add_boss_notes:${serviceId}`,
            ),
          ],
          [Markup.button.callback('Cancelar', `canc_ja:${serviceId}`)],
        ]
      : [
          [
            Markup.button.callback('Sí, confirmar', `conf_ja:${serviceId}:0`),
            Markup.button.callback('Cancelar', `canc_ja:${serviceId}`),
          ],
        ];

    await ctx.editMessageText(warnHeader + originalText, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(keyboardButtons),
    });
  }

  @Action(/^add_boss_notes:(.+)$/)
  async onAddBossNotes(@Ctx() ctx: Context) {
    await ctx.answerCbQuery();
    const actor = await this.getActor(ctx);
    if (!actor || (actor.rol !== 'jefe' && actor.rol !== 'admin')) {
      await ctx.reply('No tienes permisos para agregar notas.');
      return;
    }
    const serviceId = (ctx as any).match[1];
    const service = await this.serviciosRepository.findOneBy({ id: serviceId });
    const previous = service?.servicioPrevioId
      ? await this.serviciosRepository.findOneBy({
          id: service.servicioPrevioId,
        })
      : null;
    this.pendingNotes(ctx)[serviceId] = {
      notes: '',
      sameLocation: Boolean(
        previous?.presetLocationId &&
        previous.presetLocationId === service?.presetLocationId,
      ),
      startedAt: Date.now(),
    };
    await ctx.reply(
      `Escribe las notas internas con el formato:\n/nota ${serviceId} detalle para la empleada`,
    );
  }

  @Hears(/^\/nota\s+([0-9a-f-]{36})\s+([\s\S]{1,2000})$/i)
  async onBossNotesText(@Ctx() ctx: Context) {
    const actor = await this.getActor(ctx);
    if (!actor) return;
    const match = (ctx as any).match;
    const serviceId = match[1];
    const notes = match[2].trim();
    const existing = this.readNote(ctx, serviceId);
    if (!existing) return;
    const pending = { ...existing, notes };
    this.pendingNotes(ctx)[serviceId] = pending;
    await ctx.reply('Elige el transporte para aceptar el servicio:', {
      ...Markup.inlineKeyboard([
        [
          ...(pending.sameLocation
            ? [
                Markup.button.callback(
                  'Misma ubicación',
                  `accept_with_notes:${serviceId}:same`,
                ),
              ]
            : [
                Markup.button.callback(
                  'Chofer',
                  `accept_with_notes:${serviceId}:chofer`,
                ),
                Markup.button.callback(
                  'Uber',
                  `accept_with_notes:${serviceId}:uber`,
                ),
              ]),
        ],
      ]),
    });
  }

  @Action(/^accept_with_notes:(.+):(chofer|uber|same)$/)
  async onAcceptWithNotes(@Ctx() ctx: Context) {
    if (await this.callbackGuard.esRepetido(ctx)) return;
    const actor = await this.getActor(ctx);
    if (!actor) return;
    const match = (ctx as any).match;
    const serviceId = match[1] as string;
    const pending = this.readNote(ctx, serviceId);
    if (!pending?.notes) {
      await ctx.answerCbQuery('Las notas expiraron.', { show_alert: true });
      return;
    }
    const transportType = match[2] === 'same' ? 'chofer' : match[2];
    try {
      const res = await this.servicesService.aceptar(
        serviceId,
        actor.id,
        transportType,
        pending.notes,
      );
      delete this.pendingNotes(ctx)[serviceId];
      await ctx.answerCbQuery('Servicio aceptado con notas.');

      const inlineButtons: any[] = [];
      if (transportType === 'uber' && res.uberLink) {
        inlineButtons.push([Markup.button.url('Pedir Uber', res.uberLink)]);
        if (res.viajeId) {
          inlineButtons.push([
            Markup.button.callback(
              'Adjuntar captura',
              `uber_attach:${res.viajeId}`,
            ),
          ]);
        }
      }
      if (res.viajeId) {
        inlineButtons.push([
          Markup.button.callback(
            transportType === 'uber' ? 'Cambiar a chofer' : 'Cambiar a Uber',
            `cambiar_transporte:${res.viajeId}:${transportType === 'uber' ? 'interno' : 'uber'}`,
          ),
        ]);
      }

      await ctx.editMessageText(
        `Servicio aceptado.\nNotas internas: ${pending.notes}` +
          (res.esperandoAlistado ? `\n\n${ESPERANDO_ALISTADO}` : ''),
        inlineButtons.length > 0
          ? Markup.inlineKeyboard(inlineButtons)
          : undefined,
      );
    } catch (error: any) {
      await ctx.answerCbQuery(error.message || 'No se pudo aceptar', {
        show_alert: true,
      });
    }
  }

  private async getActor(ctx: Context): Promise<Usuarios | null> {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return null;
    return this.usuariosRepository.findOne({
      where: { telegramChatId: telegramId },
    });
  }

  @Action(/^regreso_transporte:(.+):(interno|uber)$/)
  async onReturnTransport(@Ctx() ctx: Context) {
    if (await this.callbackGuard.esRepetido(ctx)) return;
    const actor = await this.getActor(ctx);
    if (!actor)
      return ctx.answerCbQuery('Usuario no autorizado', { show_alert: true });
    const match = (ctx as any).match;
    try {
      const result = await this.servicesService.chooseReturnTransport(
        match[1],
        actor.id,
        match[2],
      );
      await ctx.answerCbQuery('Transporte de regreso registrado');
      if (match[2] === 'interno') {
        await ctx.editMessageText(
          'Regreso con chofer seleccionado. Buscando chofer disponible…',
          {
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  'Cambiar a Uber',
                  `cambiar_transporte:${result.trip.id}:uber`,
                ),
              ],
            ]),
          },
        );
      } else {
        await ctx.editMessageText('Regreso con Uber seleccionado.', {
          ...Markup.inlineKeyboard([
            [Markup.button.url('Pedir Uber', result.uberLink!)],
            [
              Markup.button.callback(
                'Adjuntar captura',
                `uber_attach:${result.trip.id}`,
              ),
            ],
            [
              Markup.button.callback(
                'Cambiar a chofer',
                `cambiar_transporte:${result.trip.id}:interno`,
              ),
            ],
          ]),
        });
      }
    } catch (error: any) {
      await ctx.answerCbQuery(
        error.message || 'No se pudo elegir el transporte',
        {
          show_alert: true,
        },
      );
    }
  }

  @Action(/^cambiar_transporte:(.+):(interno|uber)$/)
  async onChangeTripTransport(@Ctx() ctx: Context) {
    if (await this.callbackGuard.esRepetido(ctx)) return;
    const actor = await this.getActor(ctx);
    if (!actor) {
      await ctx.answerCbQuery('Usuario no autorizado', { show_alert: true });
      return;
    }
    const match = (ctx as any).match;
    const provider = match[2] as 'interno' | 'uber';
    try {
      const result = await this.servicesService.changeTripTransport(
        match[1],
        actor.id,
        provider,
      );
      await ctx.answerCbQuery('Método de transporte actualizado');
      const buttons =
        provider === 'uber'
          ? [
              [Markup.button.url('Pedir Uber', result.uberLink!)],
              [
                Markup.button.callback(
                  'Cambiar a chofer',
                  `cambiar_transporte:${result.trip.id}:interno`,
                ),
              ],
            ]
          : [
              [
                Markup.button.callback(
                  'Cambiar a Uber',
                  `cambiar_transporte:${result.trip.id}:uber`,
                ),
              ],
            ];
      await ctx.editMessageText(
        provider === 'uber'
          ? 'Viaje cambiado a Uber.'
          : 'Viaje cambiado a chofer. Buscando disponibilidad…',
        { ...Markup.inlineKeyboard(buttons) },
      );
    } catch (error: any) {
      await ctx.answerCbQuery(
        error.message || 'No se pudo cambiar el transporte',
        { show_alert: true },
      );
    }
  }

  @Action(/^uber_attach:(.+)$/)
  async onUberAttach(@Ctx() ctx: Context) {
    const actor = await this.getActor(ctx);
    if (!actor) {
      await ctx.answerCbQuery('Usuario no autorizado', { show_alert: true });
      return;
    }
    const tripId = (ctx as any).match[1];
    (ctx as any).session = {
      ...(ctx as any).session,
      step: 'AWAITING_UBER_SCREENSHOT',
      uberTripId: tripId,
    };
    await ctx.answerCbQuery();
    await ctx.reply(
      '📸 Por favor, envía ahora una fotografía (captura de pantalla) del Uber.',
    );
  }

  @Action(/^uber_fare_enter:(.+)$/)
  async onUberFareEnter(@Ctx() ctx: Context) {
    const actor = await this.getActor(ctx);
    if (!actor) {
      await ctx.answerCbQuery('Usuario no autorizado', { show_alert: true });
      return;
    }
    const tripId = (ctx as any).match[1];
    (ctx as any).session = {
      ...(ctx as any).session,
      step: 'AWAITING_UBER_FARE',
      uberTripId: tripId,
      pendingUberFare: undefined,
    };
    await ctx.answerCbQuery();
    await ctx.reply(
      'Escribe ahora el costo final del Uber, por ejemplo: 185.50',
    );
  }

  @Action(/^uber_fare_confirm:(.+)$/)
  async onUberFareConfirm(@Ctx() ctx: Context) {
    if (await this.callbackGuard.esRepetido(ctx)) return;
    const actor = await this.getActor(ctx);
    const session = (ctx as any).session;
    if (!actor || !session?.pendingUberFare) {
      return ctx.answerCbQuery(
        'La sesión expiró; adjunta la captura nuevamente',
        {
          show_alert: true,
        },
      );
    }
    try {
      await this.servicesService.confirmUberFare(
        (ctx as any).match[1],
        actor.id,
        session.pendingUberFare,
      );
      (ctx as any).session = {};
      await ctx.answerCbQuery('Costo registrado');
      await ctx.editMessageText(
        'Costo del Uber registrado y liquidación actualizada.',
      );
    } catch (error: any) {
      await ctx.answerCbQuery(error.message, { show_alert: true });
    }
  }

  @Action(/^uber_fare_correct:(.+)$/)
  async onUberFareCorrect(@Ctx() ctx: Context) {
    const session = (ctx as any).session || {};
    session.step = 'AWAITING_UBER_FARE';
    session.uberTripId = (ctx as any).match[1];
    delete session.pendingUberFare;
    (ctx as any).session = session;
    await ctx.answerCbQuery();
    await ctx.reply('Escribe nuevamente el costo final del Uber.');
  }

  @Action(/^uber_fare_cancel:(.+)$/)
  async onUberFareCancel(@Ctx() ctx: Context) {
    const tripId = (ctx as any).match[1];
    (ctx as any).session = {
      ...(ctx as any).session,
      step: 'AWAITING_UBER_FARE_ACTION',
      uberTripId: tripId,
      pendingUberFare: undefined,
    };
    await ctx.answerCbQuery('Registro cancelado');
    await ctx.editMessageText(
      'Registro del costo cancelado. Puedes introducir la tarifa cuando estés listo.',
      {
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              '💵 Introducir tarifa',
              `uber_fare_enter:${tripId}`,
            ),
          ],
        ]),
      },
    );
  }

  @Action(/^jefe_uber_estado:(.+):(en_camino|llegado)$/)
  async onBossUberStatus(@Ctx() ctx: Context) {
    const actor = await this.getActor(ctx);
    if (!actor)
      return ctx.answerCbQuery('Usuario no autorizado', { show_alert: true });
    const match = (ctx as any).match;
    try {
      await this.servicesService.updateUberStatus(
        match[1],
        actor.id,
        match[2] === 'llegado' ? 'uber_arrived' : 'uber_en_route',
      );
      await ctx.answerCbQuery(
        match[2] === 'llegado'
          ? 'La empleada fue notificada'
          : 'Estado enviado',
      );
      if (match[2] === 'en_camino') {
        await ctx.editMessageText('🚗 Uber marcado en camino.', {
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                '📍 Uber llegó',
                `jefe_uber_estado:${match[1]}:llegado`,
              ),
            ],
          ]),
        });
      } else {
        await ctx.editMessageText('✅ La llegada del Uber fue confirmada.');
      }
    } catch (error: any) {
      await ctx.answerCbQuery(error.message, { show_alert: true });
    }
  }

  @Action(/^conf_ja:(.+):([01])(?::(chofer|uber|same))?$/)
  async onConfJefeAutorizar(@Ctx() ctx: Context) {
    if (await this.callbackGuard.esRepetido(ctx)) return;
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const user = await this.usuariosRepository.findOne({
      where: { telegramChatId: telegramId },
    });

    if (!user) {
      await ctx.answerCbQuery(
        '❌ No tienes permisos para realizar esta acción.',
        { show_alert: true },
      );
      return;
    }

    const match = (ctx as any).match;
    const serviceId = match[1];
    const accept = match[2] === '1';
    const transportType = match[3] === 'same' ? 'chofer' : match[3] || 'chofer';

    // El servicio se carga para pintar el resumen y decidir la botonera.
    const servicio = await this.serviciosRepository.findOne({
      where: { id: serviceId },
      relations: { empleada: true, cliente: true },
    });

    if (!servicio) {
      await ctx.answerCbQuery('❌ Servicio no encontrado.', {
        show_alert: true,
      });
      return;
    }

    if (user.rol !== 'jefe' && user.rol !== 'admin') {
      await ctx.answerCbQuery(
        '❌ No tienes permisos para autorizar este servicio.',
        { show_alert: true },
      );
      return;
    }

    try {
      let uberLink: string | undefined;
      let viajeId: string | undefined;
      let esperandoAlistado = false;
      if (accept) {
        const res = await this.servicesService.aceptar(
          serviceId,
          user.id,
          transportType,
        );
        uberLink = res.uberLink;
        viajeId = res.viajeId;
        esperandoAlistado = Boolean(res.esperandoAlistado);
        await ctx.answerCbQuery('🟢 Servicio Aceptado exitosamente.');
      } else {
        await this.servicesService.rechazar(serviceId, user.id);
        try {
          await ctx.answerCbQuery('🔴 Servicio Rechazado.');
        } catch (e) {
          // ignore
        }
      }

      let originalText = (ctx.callbackQuery?.message as any)?.text || '';
      // Limpiar el encabezado de advertencia si existe
      originalText = originalText.replace(
        /⚠️ \*?¿Confirmas que deseas (ACEPTAR|RECHAZAR) este servicio\?\*?\n\n/,
        '',
      );

      const statusLabel = accept
        ? transportType === 'uber'
          ? 'ACEPTADO con Uber'
          : 'ACEPTADO con Chofer'
        : 'RECHAZADO';

      const options: any = { parse_mode: 'Markdown' };
      const inlineButtons: any[] = [];

      if (accept && transportType === 'uber' && uberLink) {
        inlineButtons.push([Markup.button.url('Pedir Uber', uberLink)]);
        if (viajeId) {
          inlineButtons.push([
            Markup.button.callback(
              'Adjuntar captura',
              `uber_attach:${viajeId}`,
            ),
          ]);
        }
      }

      if (accept && viajeId) {
        inlineButtons.push([
          Markup.button.callback(
            transportType === 'uber' ? 'Cambiar a chofer' : 'Cambiar a Uber',
            `cambiar_transporte:${viajeId}:${transportType === 'uber' ? 'interno' : 'uber'}`,
          ),
        ]);
      }

      if (accept && servicio.cliente?.telegramChatId) {
        inlineButtons.push([
          Markup.button.url(
            'Contactar Cliente',
            `tg://user?id=${servicio.cliente.telegramChatId}`,
          ),
        ]);
      }

      if (inlineButtons.length > 0) {
        options.reply_markup =
          Markup.inlineKeyboard(inlineButtons).reply_markup;
      }

      let resolutionMsg = `\n\n📢 *Resolución:* ${statusLabel} por ${user.email}`;
      if (accept && esperandoAlistado) {
        resolutionMsg += `\n${ESPERANDO_ALISTADO}`;
      }
      if (accept && transportType === 'uber' && uberLink) {
        resolutionMsg += `\n🔗 *Enlace Uber:* [Pedir Uber](${uberLink})`;
      }

      await ctx.editMessageText(originalText + resolutionMsg, options);
    } catch (err: any) {
      this.logger.error('Error al autorizar servicio desde Telegram:', err);
      await ctx.answerCbQuery(
        err.message || 'Error al procesar la solicitud.',
        { show_alert: true },
      );
    }
  }

  @Action(/^sched_trans:(.+):(chofer|uber)$/)
  async onScheduledTransportChoice(@Ctx() ctx: Context) {
    if (await this.callbackGuard.esRepetido(ctx)) return;
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const user = await this.usuariosRepository.findOne({
      where: { telegramChatId: telegramId },
    });

    if (!user || (user.rol !== 'jefe' && user.rol !== 'admin')) {
      await ctx.answerCbQuery(
        '❌ No tienes permisos para realizar esta acción.',
        { show_alert: true },
      );
      return;
    }

    const match = (ctx as any).match;
    const serviceId = match[1];
    const transportType = match[2] as 'chofer' | 'uber';

    try {
      const res = await this.servicesService.dispatchScheduledTrip(
        serviceId,
        transportType,
      );

      await ctx.answerCbQuery(
        `✅ Traslado iniciado con ${transportType === 'uber' ? 'Uber' : 'Chofer'}`,
      );

      const originalText = (ctx.callbackQuery?.message as any)?.text || '';
      const resolutionMsg = `\n\n📢 *Traslado despachado:* ${
        transportType === 'uber' ? 'Uber' : 'Chofer'
      } por ${user.email}${res.uberLink ? `\n🔗 *Enlace Uber:* [Pedir Uber](${res.uberLink})` : ''}`;

      const inlineButtons: any[] = [];
      if (transportType === 'uber' && res.uberLink) {
        inlineButtons.push([Markup.button.url('Pedir Uber', res.uberLink)]);
        if (res.viajeId) {
          inlineButtons.push([
            Markup.button.callback(
              'Adjuntar captura',
              `uber_attach:${res.viajeId}`,
            ),
          ]);
        }
      }

      await ctx.editMessageText(originalText + resolutionMsg, {
        parse_mode: 'Markdown',
        ...(inlineButtons.length > 0
          ? { reply_markup: Markup.inlineKeyboard(inlineButtons).reply_markup }
          : {}),
      });
    } catch (err: any) {
      this.logger.error('Error al despachar cita programada:', err);
      await ctx.answerCbQuery(err.message || 'Error al iniciar el traslado.', {
        show_alert: true,
      });
    }
  }

  @Action(/^canc_ja:(.+)$/)
  async onCancJefeAutorizar(@Ctx() ctx: Context) {
    await ctx.answerCbQuery('Acción cancelada.');
    const match = (ctx as any).match;
    const serviceId = match[1];

    let originalText = (ctx.callbackQuery?.message as any)?.text || '';
    // Limpiar el encabezado de advertencia si existe
    originalText = originalText.replace(
      /⚠️ \*?¿Confirmas que deseas (ACEPTAR|RECHAZAR) este servicio\?\*?\n\n/,
      '',
    );

    await ctx.editMessageText(originalText, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('🟢 Aceptar', `jefe_autorizar:${serviceId}:1`),
          Markup.button.callback(
            '🔴 Rechazar',
            `jefe_autorizar:${serviceId}:0`,
          ),
        ],
        [
          Markup.button.callback(
            '✏️ Editar Servicio',
            `jefe_editar_srv:${serviceId}`,
          ),
        ],
        // Atajo al panel, ya dentro de la ficha de este servicio.
        [
          Markup.button.callback(
            'Abrir en el panel',
            `panel_servicio:${serviceId}`,
          ),
        ],
      ]),
    });
  }

  // --- FLUJO DE EDICIÓN DE SERVICIO PENDIENTE DESDE TELEGRAM ---

  /**
   * Quien pulsa tiene que ser jefe o admin.
   *
   * Los botones de edicion viven en el grupo del jefe, pero cualquiera que
   * este en ese grupo --y las empleadas lo estan en algunos-- podia pulsarlos:
   * eran los unicos manejadores de servicio sin comprobar el rol, y desde ahi
   * se cambiaban las horas y el metodo de pago de un servicio ajeno.
   */
  private async esOficina(ctx: Context): Promise<boolean> {
    const actor = await this.getActor(ctx);
    if (actor && (actor.rol === 'jefe' || actor.rol === 'admin')) return true;
    await ctx.answerCbQuery(
      'No tienes permisos para modificar este servicio.',
      {
        show_alert: true,
      },
    );
    return false;
  }

  @Action(/^jefe_editar_srv:(.+)$/)
  async onJefeEditarSrv(@Ctx() ctx: Context) {
    if (!(await this.esOficina(ctx))) return;
    const match = (ctx as any).match;
    const serviceId = match[1];

    const servicio = await this.serviciosRepository.findOne({
      where: { id: serviceId },
      relations: { empleada: true, cliente: true },
    });

    if (!servicio) {
      await ctx.answerCbQuery('❌ Servicio no encontrado.');
      return;
    }

    if (servicio.estado !== 'pendiente') {
      await ctx.answerCbQuery(
        '⚠️ Solo se pueden editar servicios en estado pendiente.',
        { show_alert: true },
      );
      return;
    }

    await ctx.answerCbQuery();

    const menuMsg =
      `✏️ *Modificar Servicio Pendiente*\n\n` +
      `• *Cliente:* ${servicio.cliente?.nombreTelegram || 'Cliente'}\n` +
      `• *Empleada:* ${servicio.empleada?.nombreArtistico || 'N/A'}\n` +
      `• *Duración Actual:* ${servicio.duracionPactadaHoras} horas\n` +
      `• *Pago Actual:* ${servicio.metodoPago.toUpperCase()}\n` +
      `• *Tarifa:* $${servicio.precioBaseHoraPactado}/hr\n\n` +
      `Selecciona qué dato deseas modificar:`;

    await ctx.editMessageText(menuMsg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback('⏱️ -1 Hora', `srv_edit_dur:${serviceId}:-1`),
          Markup.button.callback('⏱️ +1 Hora', `srv_edit_dur:${serviceId}:1`),
        ],
        [
          Markup.button.callback(
            '💵 Efectivo',
            `srv_edit_pay:${serviceId}:efectivo`,
          ),
          Markup.button.callback(
            '💳 Tarjeta',
            `srv_edit_pay:${serviceId}:tarjeta`,
          ),
          Markup.button.callback(
            '📲 Transf',
            `srv_edit_pay:${serviceId}:transferencia`,
          ),
        ],
        [Markup.button.callback('🔙 Volver', `canc_ja:${serviceId}`)],
      ]),
    });
  }

  @Action(/^srv_edit_dur:(.+):(-1|1)$/)
  async onSrvEditDur(@Ctx() ctx: Context) {
    if (!(await this.esOficina(ctx))) return;
    const match = (ctx as any).match;
    const serviceId = match[1];
    const change = parseInt(match[2], 10);

    const servicio = await this.serviciosRepository.findOne({
      where: { id: serviceId },
    });

    if (!servicio || servicio.estado !== 'pendiente') {
      await ctx.answerCbQuery('⚠️ El servicio no se puede modificar.');
      return;
    }

    const current = Number(servicio.duracionPactadaHoras);
    const newDur = Math.max(1, Math.min(24, current + change));
    if (newDur === current) {
      await ctx.answerCbQuery('Duración fuera de rango.');
      return;
    }

    servicio.duracionPactadaHoras = newDur;
    await this.serviciosRepository.save(servicio);
    await ctx.answerCbQuery(`Duración actualizada a ${newDur} horas.`);

    // Regresar al menú de edición actualizado
    await this.onJefeEditarSrv(ctx);
  }

  @Action(/^srv_edit_pay:(.+):(efectivo|tarjeta|transferencia|mixto)$/)
  async onSrvEditPay(@Ctx() ctx: Context) {
    if (!(await this.esOficina(ctx))) return;
    const match = (ctx as any).match;
    const serviceId = match[1];
    const newPay = match[2] as
      'efectivo' | 'tarjeta' | 'transferencia' | 'mixto';

    const servicio = await this.serviciosRepository.findOne({
      where: { id: serviceId },
    });

    if (!servicio || servicio.estado !== 'pendiente') {
      await ctx.answerCbQuery('⚠️ El servicio no se puede modificar.');
      return;
    }

    servicio.metodoPago = newPay;
    await this.serviciosRepository.save(servicio);
    await ctx.answerCbQuery(
      `Método de pago cambiado a ${newPay.toUpperCase()}.`,
    );

    // Regresar al menú de edición actualizado
    await this.onJefeEditarSrv(ctx);
  }

  /**
   * Bloquear al cliente desde el propio aviso en el que se ve el problema.
   *
   * En caliente, un boton en el mensaje que acaba de llegar es la unica via que
   * se usa de verdad: si hay que abrir el panel, buscar al cliente y rellenar
   * un formulario, no se bloquea a nadie. El motivo detallado se puede matizar
   * despues desde la ficha del cliente.
   */
  @Action(/^bloq_cli:(\d+)$/)
  async onBloquearCliente(@Ctx() ctx: Context) {
    if (await this.callbackGuard.esRepetido(ctx)) return;
    const actor = await this.getActor(ctx);
    if (!actor || (actor.rol !== 'jefe' && actor.rol !== 'admin')) {
      this.callbackGuard.liberar(ctx);
      await ctx.answerCbQuery('No tienes permisos para bloquear clientes.', {
        show_alert: true,
      });
      return;
    }

    const telegramId = (ctx as any).match[1] as string;
    const cliente = await this.clientesRepository.findOne({
      where: { telegramChatId: telegramId },
    });
    if (!cliente) {
      this.callbackGuard.liberar(ctx);
      await ctx.answerCbQuery('Ese cliente no está registrado.', {
        show_alert: true,
      });
      return;
    }

    try {
      await this.discipline.blockClient(cliente.id, actor, {
        reason: `Bloqueado desde Telegram por ${actor.email}`,
      });
    } catch (error: any) {
      this.callbackGuard.liberar(ctx);
      await ctx.answerCbQuery(error?.message || 'No se pudo bloquear.', {
        show_alert: true,
      });
      return;
    }

    await ctx.answerCbQuery('Cliente bloqueado.');
    await ctx.reply(
      `Cliente bloqueado: ${cliente.nombreTelegram || telegramId}. El bot deja de responderle.`,
      Markup.inlineKeyboard([
        [Markup.button.callback('Deshacer', `desbloq_cli:${telegramId}`)],
      ]),
    );
  }

  @Action(/^desbloq_cli:(\d+)$/)
  async onDesbloquearCliente(@Ctx() ctx: Context) {
    if (await this.callbackGuard.esRepetido(ctx)) return;
    const actor = await this.getActor(ctx);
    if (!actor || (actor.rol !== 'jefe' && actor.rol !== 'admin')) {
      this.callbackGuard.liberar(ctx);
      await ctx.answerCbQuery('No tienes permisos.', { show_alert: true });
      return;
    }
    const telegramId = (ctx as any).match[1] as string;
    const cliente = await this.clientesRepository.findOne({
      where: { telegramChatId: telegramId },
    });
    if (!cliente) {
      await ctx.answerCbQuery('Ese cliente no está registrado.', {
        show_alert: true,
      });
      return;
    }
    try {
      await this.discipline.unblockClient(
        cliente.id,
        actor,
        `Bloqueo levantado desde Telegram por ${actor.email}`,
      );
    } catch (error: any) {
      await ctx.answerCbQuery(error?.message || 'No se pudo levantar.', {
        show_alert: true,
      });
      return;
    }
    await ctx.answerCbQuery('Bloqueo levantado.');
    await ctx.editMessageReplyMarkup(undefined).catch(() => undefined);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COMANDOS DE MONITOREO ADMIN
  // Solo ejecutables desde el chat configurado en ADMIN_SPY_CHAT_ID.
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Verifica que quien envía el comando es el administrador configurado.
   * Devuelve el spyChatId o null si no está configurado / no coincide.
   */
  private getAdminChatId(): string | null {
    const id = this.configService.get<string>('ADMIN_SPY_CHAT_ID');
    return id && id.trim() ? id.trim() : null;
  }

  private getAdminGroupId(): string | null {
    const id = this.configService.get<string>('ADMIN_SPY_GROUP_ID');
    return id && id.trim() ? id.trim() : null;
  }

  private isAdmin(ctx: Context): boolean {
    const adminId = this.getAdminChatId();
    const isPrivateAdmin = Boolean(
      adminId && ctx.from?.id.toString() === adminId,
    );

    // También es admin si está en el supergrupo configurado
    const groupId = this.getAdminGroupId();
    const isGroupAdmin = Boolean(
      groupId &&
      ctx.chat &&
      ctx.chat.id.toString() === groupId &&
      ctx.from?.id.toString() === adminId,
    );

    return isPrivateAdmin || isGroupAdmin;
  }

  /**
   * Detecta si un mensaje viene del supergrupo admin y extrae el clientTelegramId
   * a partir del thread/topic donde se envió.
   */
  private async getClientFromTopic(ctx: Context): Promise<string | null> {
    const groupId = this.getAdminGroupId();
    if (!groupId || !ctx.chat || ctx.chat.id.toString() !== groupId)
      return null;

    const msg = ctx.message as any;
    const threadId = msg?.message_thread_id;
    if (!threadId) return null;

    // Buscar el cliente cuyo adminTopicId coincide
    const cliente = await this.clientesRepository.findOne({
      where: { adminTopicId: threadId },
    });

    return cliente?.telegramChatId ?? null;
  }

  /**
   * /pausarbot <telegramId>
   *
   * Pone humanTakeover=true en la sesión del cliente indicado.
   * A partir de ese momento la IA calla y puedes contestar tú directamente
   * desde el grupo de Telegram (o el jefe desde el suyo).
   *
   * El telegramId del cliente lo ves en cada mensaje del spy:
   *   👁 Nombre · `5536271234`
   */
  @Command('pausarbot')
  async onPausarBot(@Ctx() ctx: Context) {
    if (!this.isAdmin(ctx)) return;

    const text = (ctx.message as any)?.text || '';
    const parts = text.trim().split(/\s+/);
    const clientTelegramId = parts[1];

    if (!clientTelegramId) {
      await ctx.reply(
        '❌ Uso: /pausarbot <telegramId>\n\nEl telegramId del cliente aparece en cada mensaje del spy.',
      );
      return;
    }

    // Buscar la sesión activa del cliente
    const sessions = await this.telegramSessionRepository.find();
    const clientSession = sessions.find((s) => {
      const parsed = parseSessionKey(s.key);
      return parsed?.fromId === clientTelegramId;
    });

    if (!clientSession) {
      await ctx.reply(
        `⚠️ No se encontró sesión activa para el cliente ${clientTelegramId}.\n` +
          `Puede que aún no haya escrito nada o la sesión haya expirado.`,
      );
      return;
    }

    const data: TelegramSessionData = clientSession.data || {};
    data.humanTakeover = true;
    data.iaActiva = false;
    clientSession.data = data;
    await this.telegramSessionRepository.save(clientSession);

    // Buscar el nombre del cliente
    const cliente = await this.clientesRepository.findOne({
      where: { telegramChatId: clientTelegramId },
    });
    const nombre = cliente?.nombreTelegram || clientTelegramId;

    await ctx.reply(
      `✅ Bot pausado para *${nombre}* (\`${clientTelegramId}\`)\n\n` +
        `La IA ya no responderá. Puedes contestarle tú directamente.\n` +
        `Usa /reanudarbot ${clientTelegramId} para reactivar la IA.`,
      { parse_mode: 'Markdown' },
    );
  }

  /**
   * /reanudarbot <telegramId>
   *
   * Reactiva la IA en la sesión del cliente indicado.
   */
  @Command('reanudarbot')
  async onReanudarBot(@Ctx() ctx: Context) {
    if (!this.isAdmin(ctx)) return;

    const text = (ctx.message as any)?.text || '';
    const parts = text.trim().split(/\s+/);
    const clientTelegramId = parts[1];

    if (!clientTelegramId) {
      await ctx.reply('❌ Uso: /reanudarbot <telegramId>');
      return;
    }

    const sessions = await this.telegramSessionRepository.find();
    const clientSession = sessions.find((s) => {
      const parsed = parseSessionKey(s.key);
      return parsed?.fromId === clientTelegramId;
    });

    if (!clientSession) {
      await ctx.reply(
        `⚠️ No se encontró sesión para el cliente ${clientTelegramId}.`,
      );
      return;
    }

    const data: TelegramSessionData = clientSession.data || {};
    data.humanTakeover = false;
    data.iaActiva = true;
    data.fallosIaSeguidos = 0;
    clientSession.data = data;
    await this.telegramSessionRepository.save(clientSession);

    const cliente = await this.clientesRepository.findOne({
      where: { telegramChatId: clientTelegramId },
    });
    const nombre = cliente?.nombreTelegram || clientTelegramId;

    await ctx.reply(
      `✅ IA reactivada para *${nombre}* (\`${clientTelegramId}\`)\n\n` +
        `El bot volverá a responder normalmente.`,
      { parse_mode: 'Markdown' },
    );
  }

  /**
   * /statusbot
   *
   * Lista todas las conversaciones activas y si tienen humanTakeover o IA.
   */
  @Command('statusbot')
  async onStatusBot(@Ctx() ctx: Context) {
    if (!this.isAdmin(ctx)) return;

    const sessions = await this.telegramSessionRepository.find();
    const activas = sessions.filter((s) => {
      const d: TelegramSessionData = s.data || {};
      return d.empleadaId || d.humanTakeover || d.step;
    });

    if (!activas.length) {
      await ctx.reply('📭 No hay conversaciones activas en este momento.');
      return;
    }

    const lines = await Promise.all(
      activas.map(async (s) => {
        const parsed = parseSessionKey(s.key);
        const clientTelegramId = parsed?.fromId || '?';
        const d: TelegramSessionData = s.data || {};
        const cliente = await this.clientesRepository.findOne({
          where: { telegramChatId: clientTelegramId },
        });
        const nombre = cliente?.nombreTelegram || clientTelegramId;
        const estado = d.humanTakeover
          ? '⚠️ TAKEOVER'
          : d.iaActiva === false
            ? '🔕 IA apagada'
            : '🤖 IA activa';
        const paso = d.step ? ` · paso: ${d.step}` : '';
        return `${estado} · *${nombre}* (\`${clientTelegramId}\`)${paso}`;
      }),
    );

    await ctx.reply(
      `📊 *Conversaciones activas (${activas.length}):*\n\n` + lines.join('\n'),
      { parse_mode: 'Markdown' },
    );
  }

  /**
   * /enviar <telegramId> <mensaje...>
   *
   * Permite al administrador enviar un mensaje a un cliente específico.
   */
  @Command('enviar')
  async onEnviar(@Ctx() ctx: Context) {
    if (!this.isAdmin(ctx)) return;

    const text = (ctx.message as any)?.text || '';
    const parts = text.trim().split(/\s+/);
    const clientTelegramId = parts[1];
    const messageToSend = parts.slice(2).join(' ');

    if (!clientTelegramId || !messageToSend) {
      await ctx.reply('❌ Uso: /enviar <telegramId> <mensaje a enviar>');
      return;
    }

    try {
      await this.bot.telegram.sendMessage(clientTelegramId, messageToSend);
      await ctx.reply(`✅ Mensaje enviado a \`${clientTelegramId}\``, {
        parse_mode: 'Markdown',
      });
    } catch (error: any) {
      this.logger.error(
        `Error enviando mensaje manual a ${clientTelegramId}`,
        error,
      );
      await ctx.reply(
        `❌ Fallo al enviar mensaje: ${error?.message || 'Error desconocido'}`,
      );
    }
  }

  /**
   * /chats
   *
   * Lista todos los clientes que han interactuado con el bot recientemente.
   */
  @Command('chats')
  async onChats(@Ctx() ctx: Context) {
    if (!this.isAdmin(ctx)) return;

    const sessions = await this.telegramSessionRepository.find();
    const clientSessions = sessions
      .map((s) => {
        const parsed = parseSessionKey(s.key);
        if (!parsed?.fromId) return null;
        const d: TelegramSessionData = s.data || {};
        return {
          telegramId: parsed.fromId,
          step: d.step || '?',
          humanTakeover: !!d.humanTakeover,
          iaActiva: d.iaActiva !== false,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x);

    if (!clientSessions.length) {
      await ctx.reply('📭 No hay conversaciones activas en este momento.');
      return;
    }

    // Buscar nombres de clientes
    const clientInfos = await Promise.all(
      clientSessions.map(async (cs) => {
        const cliente = await this.clientesRepository.findOne({
          where: { telegramChatId: cs.telegramId },
        });
        const nombre = cliente?.nombreTelegram || cs.telegramId;
        const estado = cs.humanTakeover ? '⚠️' : cs.iaActiva ? '🤖' : '🔕';
        return { ...cs, nombre, estado };
      }),
    );

    const isGroup =
      this.getAdminGroupId() &&
      ctx.chat?.id.toString() === this.getAdminGroupId();

    const buttons = clientInfos.map((ci) => [
      Markup.button.callback(
        `${ci.estado} ${ci.nombre} (${ci.step})`,
        isGroup
          ? `open_topic:${ci.telegramId}`
          : `spy_history:${ci.telegramId}`,
      ),
    ]);

    await ctx.reply(
      `📋 *Conversaciones activas (${clientInfos.length}):*\n\nToca un cliente para ver su historial:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons),
      },
    );
  }

  /**
   * /clientes
   *
   * Lista los últimos 20 clientes registrados.
   */
  @Command('clientes')
  async onClientes(@Ctx() ctx: Context) {
    if (!this.isAdmin(ctx)) return;

    const clientes = await this.clientesRepository.find({
      order: { primerContactoAt: 'DESC' },
      take: 20,
    });

    if (!clientes.length) {
      await ctx.reply('📭 No hay clientes registrados.');
      return;
    }

    const isGroup =
      this.getAdminGroupId() &&
      ctx.chat?.id.toString() === this.getAdminGroupId();

    const buttons = clientes.map((c) => [
      Markup.button.callback(
        `👤 ${c.nombreTelegram || 'Desconocido'} (${c.telegramChatId})`,
        isGroup
          ? `open_topic:${c.telegramChatId}`
          : `spy_history:${c.telegramChatId}`,
      ),
    ]);

    await ctx.reply(
      `📋 *Últimos 20 clientes:*\n\nToca un cliente para abrir su ficha e historial:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons),
      },
    );
  }

  /**
   * /buscar <nombre o id>
   *
   * Busca clientes por nombre o telegram ID.
   */
  @Command('buscar')
  async onBuscar(@Ctx() ctx: Context) {
    if (!this.isAdmin(ctx)) return;

    const text = (ctx.message as any)?.text || '';
    const query = text.replace('/buscar', '').trim();

    if (!query) {
      await ctx.reply('❌ Uso: /buscar <nombre o ID del cliente>');
      return;
    }

    const isNumeric = /^\d+$/.test(query);

    const qb = this.clientesRepository.createQueryBuilder('c');
    if (isNumeric) {
      qb.where('c.telegramChatId LIKE :query', { query: `%${query}%` });
    } else {
      qb.where('c.nombreTelegram ILIKE :query', { query: `%${query}%` });
    }

    const clientes = await qb
      .orderBy('c.primerContactoAt', 'DESC')
      .take(10)
      .getMany();

    if (!clientes.length) {
      await ctx.reply(
        `📭 No se encontraron clientes para la búsqueda: *${query}*`,
        { parse_mode: 'Markdown' },
      );
      return;
    }

    const isGroup =
      this.getAdminGroupId() &&
      ctx.chat?.id.toString() === this.getAdminGroupId();

    const buttons = clientes.map((c) => [
      Markup.button.callback(
        `👤 ${c.nombreTelegram || 'Desconocido'} (${c.telegramChatId})`,
        isGroup
          ? `open_topic:${c.telegramChatId}`
          : `spy_history:${c.telegramChatId}`,
      ),
    ]);

    await ctx.reply(
      `🔍 *Resultados para "${query}" (${clientes.length}):*\n\nToca un cliente para abrir su ficha e historial:`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(buttons),
      },
    );
  }

  /**
   * Abre o localiza el tema de un cliente en el supergrupo.
   */
  @Action(/^open_topic:(\d+)$/)
  async onOpenTopic(@Ctx() ctx: Context) {
    if (!this.isAdmin(ctx)) return;
    const match = (ctx as any).match;
    const clientTelegramId = match[1];
    const groupId = this.getAdminGroupId();

    if (!groupId) {
      await ctx.answerCbQuery('❌ El supergrupo no está configurado.');
      return;
    }

    const cliente = await this.clientesRepository.findOne({
      where: { telegramChatId: clientTelegramId },
    });

    if (!cliente) {
      await ctx.answerCbQuery('❌ Cliente no encontrado.');
      return;
    }

    const clientName = cliente.nombreTelegram || 'Cliente';
    let topicId = cliente.adminTopicId;

    try {
      if (!topicId) {
        // Crear el tema si no existe
        const topic = await this.bot.telegram.createForumTopic(
          groupId,
          `${clientName} · ${clientTelegramId}`,
        );
        topicId = topic.message_thread_id;
        cliente.adminTopicId = topicId;
        await this.clientesRepository.save(cliente);

        // Enviar ficha inicial
        await this.bot.telegram.sendMessage(
          groupId,
          `📋 *Ficha del cliente*\n\n` +
            `👤 *Nombre:* ${clientName}\n` +
            `🆔 *Telegram ID:* \`${clientTelegramId}\`\n` +
            `📅 *Primer contacto:* ${cliente.primerContactoAt ? new Date(cliente.primerContactoAt).toLocaleDateString('es-CO') : 'Desconocido'}\n\n` +
            `_Todo lo que escribas aquí se le enviará al cliente._`,
          {
            message_thread_id: topicId,
            parse_mode: 'Markdown',
          },
        );
      } else {
        // Notificar que el tema ya existe
        await this.bot.telegram.sendMessage(
          groupId,
          `ℹ️ *Llamado desde búsqueda*\nEste es el tema de ${clientName}.`,
          { message_thread_id: topicId, parse_mode: 'Markdown' },
        );
      }

      // Siempre mandar un resumen del historial al tema
      const conversations = await this.conversationsRepository.find({
        where: { cliente: { id: cliente.id } },
        order: { enviadoAt: 'DESC' },
        take: 10,
      });

      if (conversations.length > 0) {
        conversations.reverse();
        const lines = conversations.map((c: ConversacionesTelegram) => {
          const emoji = c.emisor === 'cliente' ? '👤' : '🤖';
          return `${emoji} *${c.emisor === 'cliente' ? clientName : 'Bot'}*: ${c.mensaje}`;
        });
        await this.bot.telegram.sendMessage(
          groupId,
          `📜 *Últimos ${conversations.length} mensajes:*\n\n` +
            lines.join('\n\n'),
          { message_thread_id: topicId, parse_mode: 'Markdown' },
        );
      }

      await ctx.answerCbQuery(`✅ Tema abierto para ${clientName}.`);
    } catch (error: any) {
      this.logger.error(`Error abriendo tema para ${clientTelegramId}`, error);
      await ctx.answerCbQuery(`❌ Error: ${error?.message}`);
    }
  }

  /**
   * /chat <telegramId>
   *
   * Muestra los últimos 10 mensajes del historial con un cliente específico.
   */
  @Command('chat')
  async onChat(@Ctx() ctx: Context) {
    if (!this.isAdmin(ctx)) return;

    const text = (ctx.message as any)?.text || '';
    const parts = text.trim().split(/\s+/);
    const clientTelegramId = parts[1];

    if (!clientTelegramId) {
      await ctx.reply(
        '❌ Uso: /chat <telegramId>\n\nEjemplo: /chat 5536271234',
      );
      return;
    }

    await this.showClientHistory(ctx, clientTelegramId);
  }

  /**
   * /chatear <telegramId>
   *
   * Abre un "canal directo" con un cliente. A partir de ese momento, todo lo
   * que escribas (texto o fotos) se envía directamente a ese cliente, hasta
   * que escribas /salir.
   */
  @Command('chatear')
  async onChatear(@Ctx() ctx: Context) {
    if (!this.isAdmin(ctx)) return;

    const text = (ctx.message as any)?.text || '';
    const parts = text.trim().split(/\s+/);
    const clientTelegramId = parts[1];

    if (!clientTelegramId) {
      await ctx.reply(
        '❌ Uso: /chatear <telegramId>\n\n' +
          'Abre un canal directo. Todo lo que escribas se le enviará al cliente.\n' +
          'Escribe /salir para cerrar el canal.',
      );
      return;
    }

    const cliente = await this.clientesRepository.findOne({
      where: { telegramChatId: clientTelegramId },
    });
    const nombre = cliente?.nombreTelegram || clientTelegramId;

    // Guardar en memoria el canal activo
    this.activeAdminChat = clientTelegramId;

    await ctx.reply(
      `🔗 *Canal abierto con ${nombre}* (\`${clientTelegramId}\`)\n\n` +
        `Todo lo que escribas aquí se le enviará directamente.\n` +
        `📷 También puedes enviar fotos.\n` +
        `Escribe /salir para cerrar el canal.`,
      { parse_mode: 'Markdown' },
    );
  }

  @Command('salir')
  async onSalir(@Ctx() ctx: Context) {
    if (!this.isAdmin(ctx)) return;

    if (!this.activeAdminChat) {
      await ctx.reply('ℹ️ No hay ningún canal abierto.');
      return;
    }

    const closed = this.activeAdminChat;
    this.activeAdminChat = null;
    await ctx.reply(`✅ Canal con \`${closed}\` cerrado.`, {
      parse_mode: 'Markdown',
    });
  }

  // ── Inline button handlers ──────────────────────────────────────────────

  /**
   * Botón "Responder" en un mensaje espía.
   * Activa el canal directo con ese cliente.
   */
  @Action(/^spy_reply:(\d+)$/)
  async onSpyReply(@Ctx() ctx: Context) {
    if (!this.isAdmin(ctx)) return;
    const clientTelegramId = (ctx as any).match[1] as string;

    const cliente = await this.clientesRepository.findOne({
      where: { telegramChatId: clientTelegramId },
    });
    const nombre = cliente?.nombreTelegram || clientTelegramId;

    this.activeAdminChat = clientTelegramId;

    await ctx.answerCbQuery(`Canal abierto con ${nombre}`);
    await ctx.reply(
      `🔗 *Canal abierto con ${nombre}* (\`${clientTelegramId}\`)\n\n` +
        `Escribe tu mensaje y se le enviará directamente.\n` +
        `📷 Puedes enviar fotos también.\n` +
        `Escribe /salir para cerrar el canal.`,
      { parse_mode: 'Markdown' },
    );
  }

  /**
   * Botón "Pausar IA" en un mensaje espía.
   */
  @Action(/^spy_pause:(\d+)$/)
  async onSpyPause(@Ctx() ctx: Context) {
    if (!this.isAdmin(ctx)) return;
    const clientTelegramId = (ctx as any).match[1] as string;

    const sessions = await this.telegramSessionRepository.find();
    const clientSession = sessions.find((s) => {
      const parsed = parseSessionKey(s.key);
      return parsed?.fromId === clientTelegramId;
    });

    if (!clientSession) {
      await ctx.answerCbQuery('Sesión no encontrada', { show_alert: true });
      return;
    }

    const data: TelegramSessionData = clientSession.data || {};
    data.humanTakeover = true;
    data.iaActiva = false;
    clientSession.data = data;
    await this.telegramSessionRepository.save(clientSession);

    await ctx.answerCbQuery('IA pausada ✅');
    await ctx.reply(
      `⏸ *IA pausada* para \`${clientTelegramId}\`\n` +
        `Puedes contestar tú con /chatear ${clientTelegramId}`,
      { parse_mode: 'Markdown' },
    );
  }

  /**
   * Botón "Reanudar IA" en un mensaje espía.
   */
  @Action(/^spy_resume:(\d+)$/)
  async onSpyResume(@Ctx() ctx: Context) {
    if (!this.isAdmin(ctx)) return;
    const clientTelegramId = (ctx as any).match[1] as string;

    const sessions = await this.telegramSessionRepository.find();
    const clientSession = sessions.find((s) => {
      const parsed = parseSessionKey(s.key);
      return parsed?.fromId === clientTelegramId;
    });

    if (!clientSession) {
      await ctx.answerCbQuery('Sesión no encontrada', { show_alert: true });
      return;
    }

    const data: TelegramSessionData = clientSession.data || {};
    data.humanTakeover = false;
    data.iaActiva = true;
    data.fallosIaSeguidos = 0;
    clientSession.data = data;
    await this.telegramSessionRepository.save(clientSession);

    await ctx.answerCbQuery('IA reanudada ✅');
    await ctx.reply(`▶️ *IA reactivada* para \`${clientTelegramId}\``, {
      parse_mode: 'Markdown',
    });
  }

  /**
   * Botón "Historial" en un mensaje espía.
   */
  @Action(/^spy_history:(\d+)$/)
  async onSpyHistory(@Ctx() ctx: Context) {
    if (!this.isAdmin(ctx)) return;
    const clientTelegramId = (ctx as any).match[1] as string;
    await ctx.answerCbQuery('Cargando historial...');
    await this.showClientHistory(ctx, clientTelegramId);
  }

  /**
   * Muestra los últimos mensajes de un cliente en el chat del admin.
   */
  private async showClientHistory(ctx: Context, clientTelegramId: string) {
    const cliente = await this.clientesRepository.findOne({
      where: { telegramChatId: clientTelegramId },
    });
    const nombre = cliente?.nombreTelegram || clientTelegramId;

    if (!cliente) {
      await ctx.reply(
        `⚠️ Cliente con Telegram ID \`${clientTelegramId}\` no encontrado en BD.`,
        {
          parse_mode: 'Markdown',
        },
      );
      return;
    }

    // Obtener últimos 15 mensajes de la BD
    const conversations = await this.conversationsRepository.find({
      where: { clienteId: cliente.id },
      order: { enviadoAt: 'DESC' },
      take: 15,
    });

    if (!conversations.length) {
      await ctx.reply(
        `📭 No hay historial para *${nombre}* (\`${clientTelegramId}\`)`,
        { parse_mode: 'Markdown' },
      );
      return;
    }

    const lines = conversations.reverse().map((c) => {
      const time = new Date(c.enviadoAt).toLocaleTimeString('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Bogota',
      });
      const icon =
        c.emisor === 'cliente'
          ? '👤'
          : c.emisor === 'ia'
            ? '🤖'
            : c.emisor === 'jefe'
              ? '👨‍💼'
              : '⚙️';
      return `${icon} [${time}] ${c.mensaje.slice(0, 200)}`;
    });

    await ctx.reply(
      `📜 *Historial de ${nombre}* (\`${clientTelegramId}\`)\n` +
        `Últimos ${conversations.length} mensajes:\n\n` +
        lines.join('\n\n'),
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              '💬 Responder',
              `spy_reply:${clientTelegramId}`,
            ),
            Markup.button.callback(
              '⏸ Pausar IA',
              `spy_pause:${clientTelegramId}`,
            ),
          ],
        ]),
      },
    );
  }

  /**
   * Handler de mensajes del admin.
   *
   * Funciona en 3 modos:
   * 1. Supergrupo: si escribe en un tema del supergrupo admin, detecta el
   *    cliente por el topic y reenvía directamente (como WhatsApp).
   * 2. Canal activo (chat privado): si tiene /chatear activo, envía directo.
   * 3. Reply a mensaje espía (chat privado): extrae el ID del reply.
   *
   * Soporta texto, fotos y documentos.
   */
  @On('message')
  async onAdminReply(@Ctx() ctx: Context) {
    if (!this.isAdmin(ctx)) return;

    const msg = ctx.message as any;
    if (msg?.text?.startsWith('/')) return; // Ignorar comandos

    // ── Modo Supergrupo: detectar cliente por tema ──
    const clientFromTopic = await this.getClientFromTopic(ctx);
    if (clientFromTopic) {
      try {
        if (msg?.photo && msg.photo.length > 0) {
          const fileId = msg.photo[msg.photo.length - 1].file_id;
          await this.bot.telegram.sendPhoto(clientFromTopic, fileId, {
            caption: msg.caption || undefined,
          });
          await ctx.reply(`✅ 📷 Foto enviada`, {
            message_thread_id: msg.message_thread_id,
          });
          return;
        }

        if (msg?.document) {
          await this.bot.telegram.sendDocument(
            clientFromTopic,
            msg.document.file_id,
            {
              caption: msg.caption || undefined,
            },
          );
          await ctx.reply(`✅ 📎 Archivo enviado`, {
            message_thread_id: msg.message_thread_id,
          });
          return;
        }

        if (msg?.text) {
          await this.bot.telegram.sendMessage(clientFromTopic, msg.text);
          await ctx.reply(`✅ Enviado`, {
            message_thread_id: msg.message_thread_id,
          });
          return;
        }
      } catch (error: any) {
        this.logger.error(
          `Error en supergrupo admin → ${clientFromTopic}`,
          error,
        );
        await ctx.reply(`❌ ${error?.message || 'Error'}`, {
          message_thread_id: msg.message_thread_id,
        });
        return;
      }
    }

    // ── Canal activo (chat privado): enviar directamente ──
    if (this.activeAdminChat && ctx.chat?.type === 'private') {
      try {
        if (msg?.photo && msg.photo.length > 0) {
          const fileId = msg.photo[msg.photo.length - 1].file_id;
          await this.bot.telegram.sendPhoto(this.activeAdminChat, fileId, {
            caption: msg.caption || undefined,
          });
          await ctx.reply(`✅ 📷 Foto enviada a \`${this.activeAdminChat}\``, {
            parse_mode: 'Markdown',
          });
          return;
        }

        if (msg?.document) {
          await this.bot.telegram.sendDocument(
            this.activeAdminChat,
            msg.document.file_id,
            { caption: msg.caption || undefined },
          );
          await ctx.reply(
            `✅ 📎 Archivo enviado a \`${this.activeAdminChat}\``,
            {
              parse_mode: 'Markdown',
            },
          );
          return;
        }

        if (msg?.text) {
          await this.bot.telegram.sendMessage(this.activeAdminChat, msg.text);
          await ctx.reply(`✅ Enviado a \`${this.activeAdminChat}\``, {
            parse_mode: 'Markdown',
          });
          return;
        }
      } catch (error: any) {
        this.logger.error(
          `Error en canal admin a ${this.activeAdminChat}`,
          error,
        );
        await ctx.reply(
          `❌ Fallo al enviar: ${error?.message || 'Error desconocido'}`,
        );
        return;
      }
    }

    // ── Reply a un mensaje espía (sin canal activo, chat privado) ──
    if (!msg?.reply_to_message || ctx.chat?.type !== 'private') return;

    const repliedMsg = msg.reply_to_message;
    if (repliedMsg.from?.id !== ctx.botInfo.id) return;

    const replyText = repliedMsg.text || repliedMsg.caption || '';
    const match = replyText.match(/`(\d{6,15})`/);
    if (!match || !match[1]) return;

    const clientTelegramId = match[1];
    try {
      if (msg?.photo && msg.photo.length > 0) {
        const fileId = msg.photo[msg.photo.length - 1].file_id;
        await this.bot.telegram.sendPhoto(clientTelegramId, fileId, {
          caption: msg.caption || undefined,
        });
        await ctx.reply(`✅ 📷 Foto enviada a \`${clientTelegramId}\``, {
          parse_mode: 'Markdown',
        });
        return;
      }

      if (msg?.text) {
        await this.bot.telegram.sendMessage(clientTelegramId, msg.text);
        await ctx.reply(`✅ Respondido a \`${clientTelegramId}\``, {
          parse_mode: 'Markdown',
        });
      }
    } catch (error: any) {
      this.logger.error(`Error en Reply admin a ${clientTelegramId}`, error);
      await ctx.reply(
        `❌ Fallo al responder: ${error?.message || 'Error desconocido'}`,
      );
    }
  }
}
