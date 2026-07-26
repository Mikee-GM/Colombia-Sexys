import { Inject, forwardRef } from '@nestjs/common';
import { Update, Ctx, Action, Hears } from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuarios } from '../users/entities/user.entity';
import { Servicios } from '../services/entities/service.entity';
import { ServicesService } from '../services/services.service';

@Update()
export class TelegramAdminUpdate {
  private readonly pendingBossNotes = new Map<
    string,
    { serviceId: string; notes: string; sameLocation: boolean }
  >();
  constructor(
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    @InjectRepository(Servicios)
    private readonly serviciosRepository: Repository<Servicios>,
    @Inject(forwardRef(() => ServicesService))
    private readonly servicesService: ServicesService,
  ) {}

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

    // Obtener información del servicio para validar si es una empleada independiente autorizándose a sí misma
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
                    '📍 Sin notas, misma ubicación',
                    `conf_ja:${serviceId}:1:same`,
                  ),
                ]
              : [
                  Markup.button.callback(
                    '🚗 Sin notas, Chofer',
                    `conf_ja:${serviceId}:1:chofer`,
                  ),
                  Markup.button.callback(
                    '📱 Sin notas, Uber',
                    `conf_ja:${serviceId}:1:uber`,
                  ),
                ]),
          ],
          [
            Markup.button.callback(
              '📝 Agregar notas',
              `add_boss_notes:${serviceId}`,
            ),
          ],
          [Markup.button.callback('❌ Cancelar', `canc_ja:${serviceId}`)],
        ]
      : [
          [
            Markup.button.callback(
              '✅ Sí, confirmar',
              `conf_ja:${serviceId}:0`,
            ),
            Markup.button.callback('❌ Cancelar', `canc_ja:${serviceId}`),
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
    this.pendingBossNotes.set(`${actor.id}:${serviceId}`, {
      serviceId,
      notes: '',
      sameLocation: Boolean(
        previous?.presetLocationId &&
        previous.presetLocationId === service?.presetLocationId,
      ),
    });
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
    const key = `${actor.id}:${serviceId}`;
    if (!this.pendingBossNotes.has(key)) return;
    this.pendingBossNotes.set(key, {
      ...this.pendingBossNotes.get(key)!,
      notes,
    });
    const pending = this.pendingBossNotes.get(key)!;
    await ctx.reply('Elige el transporte para aceptar el servicio:', {
      ...Markup.inlineKeyboard([
        [
          ...(pending.sameLocation
            ? [
                Markup.button.callback(
                  '📍 Misma ubicación',
                  `accept_with_notes:${serviceId}:same`,
                ),
              ]
            : [
                Markup.button.callback(
                  '🚗 Chofer',
                  `accept_with_notes:${serviceId}:chofer`,
                ),
                Markup.button.callback(
                  '📱 Uber',
                  `accept_with_notes:${serviceId}:uber`,
                ),
              ]),
        ],
      ]),
    });
  }

  @Action(/^accept_with_notes:(.+):(chofer|uber|same)$/)
  async onAcceptWithNotes(@Ctx() ctx: Context) {
    const actor = await this.getActor(ctx);
    if (!actor) return;
    const match = (ctx as any).match;
    const key = `${actor.id}:${match[1]}`;
    const pending = this.pendingBossNotes.get(key);
    if (!pending?.notes) {
      await ctx.answerCbQuery('Las notas expiraron.', { show_alert: true });
      return;
    }
    try {
      await this.servicesService.aceptar(
        pending.serviceId,
        actor.id,
        match[2] === 'same' ? 'chofer' : match[2],
        pending.notes,
      );
      this.pendingBossNotes.delete(key);
      await ctx.answerCbQuery('Servicio aceptado con notas.');
      await ctx.editMessageText(
        `🟢 Servicio aceptado.\n📝 Notas internas: ${pending.notes}`,
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
          '🚗 Regreso con chofer seleccionado. Buscando chofer disponible…',
          {
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  '📱 Cambiar a Uber',
                  `cambiar_transporte:${result.trip.id}:uber`,
                ),
              ],
            ]),
          },
        );
      } else {
        await ctx.editMessageText('📱 Regreso con Uber seleccionado.', {
          ...Markup.inlineKeyboard([
            [Markup.button.url('📱 Pedir Uber', result.uberLink!)],
            [
              Markup.button.callback(
                '📸 Adjuntar captura',
                `uber_attach:${result.trip.id}`,
              ),
            ],
            [
              Markup.button.callback(
                '🚗 Cambiar a chofer',
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
              [Markup.button.url('📱 Pedir Uber', result.uberLink!)],
              [
                Markup.button.callback(
                  '🚗 Cambiar a chofer',
                  `cambiar_transporte:${result.trip.id}:interno`,
                ),
              ],
            ]
          : [
              [
                Markup.button.callback(
                  '📱 Cambiar a Uber',
                  `cambiar_transporte:${result.trip.id}:uber`,
                ),
              ],
            ];
      await ctx.editMessageText(
        provider === 'uber'
          ? '📱 Viaje cambiado a Uber.'
          : '🚗 Viaje cambiado a chofer. Buscando disponibilidad…',
        { ...Markup.inlineKeyboard(buttons) },
      );
    } catch (error: any) {
      await ctx.answerCbQuery(
        error.message || 'No se pudo cambiar el transporte',
        { show_alert: true },
      );
    }
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

    // Obtener información del servicio para validar si es una empleada independiente autorizándose a sí misma
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
      if (accept) {
        const res = await this.servicesService.aceptar(
          serviceId,
          user.id,
          transportType as any,
        );
        uberLink = res.uberLink;
        viajeId = res.viajeId;
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
          ? '🟢 ACEPTADO con Uber'
          : '🟢 ACEPTADO con Chofer'
        : '🔴 RECHAZADO';

      const options: any = { parse_mode: 'Markdown' };
      const inlineButtons: any[] = [];

      if (accept && transportType === 'uber' && uberLink) {
        inlineButtons.push([Markup.button.url('📱 Pedir Uber', uberLink)]);
        if (viajeId) {
          inlineButtons.push([
            Markup.button.callback(
              '📸 Adjuntar captura',
              `uber_attach:${viajeId}`,
            ),
          ]);
        }
      }

      if (accept && viajeId) {
        inlineButtons.push([
          Markup.button.callback(
            transportType === 'uber'
              ? '🚗 Cambiar a chofer'
              : '📱 Cambiar a Uber',
            `cambiar_transporte:${viajeId}:${transportType === 'uber' ? 'interno' : 'uber'}`,
          ),
        ]);
      }

      if (accept && servicio.cliente?.telegramChatId) {
        inlineButtons.push([
          Markup.button.url(
            '💬 Contactar Cliente',
            `tg://user?id=${servicio.cliente.telegramChatId}`,
          ),
        ]);
      }

      if (inlineButtons.length > 0) {
        options.reply_markup =
          Markup.inlineKeyboard(inlineButtons).reply_markup;
      }

      let resolutionMsg = `\n\n📢 *Resolución:* ${statusLabel} por ${user.email}`;
      if (accept && transportType === 'uber' && uberLink) {
        resolutionMsg += `\n🔗 *Enlace Uber:* [Pedir Uber](${uberLink})`;
      }

      await ctx.editMessageText(originalText + resolutionMsg, options);
    } catch (err: any) {
      console.error('Error al autorizar servicio desde Telegram:', err);
      await ctx.answerCbQuery(
        err.message || 'Error al procesar la solicitud.',
        { show_alert: true },
      );
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
      ]),
    });
  }
}
