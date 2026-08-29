import { Injectable, Logger } from '@nestjs/common';
import { InjectBot } from 'nestjs-telegraf';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Context, Markup, Telegraf } from 'telegraf';
import { Clientes } from '../clients/entities/client.entity';
import { Usuarios } from '../users/entities/user.entity';
import { TransportOperationsService } from '../transport-operations/transport-operations.service';
import { ManualServicesService } from '../manual-services/manual-services.service';
import { SolicitudServicioManual } from '../manual-services/entities/manual-service-request.entity';
import { APP_LOCALE, APP_TIME_ZONE } from '../common/locale';
import { describeError } from '../common/errors/error-message';

/** Los pasos por los que pasa la empleada al registrar un servicio pasado. */
export type PasoRegistroManual =
  | 'fecha'
  | 'hora'
  | 'duracion'
  | 'cliente'
  | 'cliente_busqueda'
  | 'cliente_nombre'
  | 'pago'
  | 'monto'
  | 'ubicacion_otra'
  | 'motivo'
  | 'confirmar';

export interface RegistroManualEnCurso {
  paso: PasoRegistroManual;
  fecha?: string;
  duracionHoras?: number;
  clienteId?: string;
  clienteNombre?: string;
  metodoPago?: 'efectivo' | 'tarjeta' | 'transferencia';
  montoCobrado?: number;
  ubicacion?: string;
  motivo?: string;
}

type CtxConSesion = Context & {
  session?: { registroManual?: RegistroManualEnCurso };
};

const MAX_RESULTADOS_BUSQUEDA = 6;

/**
 * Asistente para registrar un servicio que ocurrio fuera del sistema.
 *
 * Vive aparte de los manejadores de reserva porque no comparte nada con ellos:
 * aqui no hay cliente esperando, ni precio que negociar, ni viaje. Es un
 * formulario, y en Telegram un formulario son preguntas de una en una.
 *
 * El texto libre no se captura con un `@On('text')` propio: eso dependeria del
 * orden en que Nest registre los `@Update()`, y el manejador de mensajes del
 * cliente atrapa todo lo que llega. En su lugar, ese manejador llama a
 * `manejarTexto` antes de lo suyo y este devuelve si el mensaje era para el.
 */
@Injectable()
export class TelegramManualServiceWizard {
  private readonly logger = new Logger(TelegramManualServiceWizard.name);

  constructor(
    @InjectBot() private readonly bot: Telegraf<Context>,
    @InjectRepository(Clientes)
    private readonly clientes: Repository<Clientes>,
    @InjectRepository(Usuarios)
    private readonly usuarios: Repository<Usuarios>,
    private readonly transportOperations: TransportOperationsService,
    private readonly manualServices: ManualServicesService,
  ) {}

  private enCurso(ctx: CtxConSesion): RegistroManualEnCurso | undefined {
    return ctx.session?.registroManual;
  }

  /** Arranca el formulario. Solo para empleadas vinculadas. */
  async iniciar(ctx: CtxConSesion): Promise<void> {
    const telegramId = ctx.from?.id?.toString();
    const usuario = telegramId
      ? await this.usuarios.findOne({
          where: { telegramChatId: telegramId, rol: 'empleada' },
        })
      : null;
    if (!usuario) {
      await ctx.reply(
        'Este registro es solo para empleadas vinculadas al sistema.',
      );
      return;
    }

    ctx.session ??= {};
    ctx.session.registroManual = { paso: 'fecha' };
    await ctx.reply(
      [
        'Vamos a registrar un servicio que no pasó por el sistema.',
        '',
        'Tu jefe tiene que autorizarlo para que cuente en tu corte.',
        '',
        '¿Qué día fue?',
      ].join('\n'),
      Markup.inlineKeyboard([
        [
          Markup.button.callback('Hoy', 'rm_fecha:hoy'),
          Markup.button.callback('Ayer', 'rm_fecha:ayer'),
        ],
        [Markup.button.callback('Otra fecha', 'rm_fecha:otra')],
        [Markup.button.callback('Cancelar', 'rm_cancelar')],
      ]),
    );
  }

  async cancelar(ctx: CtxConSesion): Promise<void> {
    if (ctx.session) ctx.session.registroManual = undefined;
    await ctx.reply('Registro cancelado. No se guardó nada.');
  }

  /** Día elegido con los botones; la hora se pregunta después. */
  async elegirFecha(ctx: CtxConSesion, opcion: string): Promise<void> {
    const registro = this.enCurso(ctx);
    if (!registro) return;

    if (opcion === 'otra') {
      registro.paso = 'fecha';
      await ctx.reply(
        'Escribe la fecha y la hora en que fue, así: 24/08/2026 22:30',
      );
      return;
    }

    const dia = new Date();
    if (opcion === 'ayer') dia.setDate(dia.getDate() - 1);
    registro.fecha = dia.toISOString();
    registro.paso = 'hora';
    await ctx.reply('¿A qué hora empezó? Escríbela así: 22:30');
  }

  async elegirDuracion(ctx: CtxConSesion, horas: number): Promise<void> {
    const registro = this.enCurso(ctx);
    if (!registro) return;
    registro.duracionHoras = horas;
    registro.paso = 'cliente';
    await this.preguntarCliente(ctx);
  }

  private async preguntarCliente(ctx: CtxConSesion): Promise<void> {
    await ctx.reply(
      '¿Quién fue el cliente?',
      Markup.inlineKeyboard([
        [Markup.button.callback('Buscarlo por nombre o ID', 'rm_cli:buscar')],
        [Markup.button.callback('No está registrado', 'rm_cli:libre')],
        [Markup.button.callback('Prefiero no decirlo', 'rm_cli:anonimo')],
        [Markup.button.callback('Cancelar', 'rm_cancelar')],
      ]),
    );
  }

  async elegirModoCliente(ctx: CtxConSesion, modo: string): Promise<void> {
    const registro = this.enCurso(ctx);
    if (!registro) return;

    if (modo === 'buscar') {
      registro.paso = 'cliente_busqueda';
      await ctx.reply(
        'Escribe su nombre de Telegram o su ID y te muestro los que encuentre.',
      );
      return;
    }
    if (modo === 'libre') {
      registro.paso = 'cliente_nombre';
      await ctx.reply('¿Cómo se llama? Con el nombre que tú le conozcas.');
      return;
    }
    registro.clienteId = undefined;
    registro.clienteNombre = undefined;
    registro.paso = 'pago';
    await this.preguntarPago(ctx);
  }

  /** Cliente elegido de los resultados de la búsqueda. */
  async elegirCliente(ctx: CtxConSesion, clienteId: string): Promise<void> {
    const registro = this.enCurso(ctx);
    if (!registro) return;
    const cliente = await this.clientes.findOne({ where: { id: clienteId } });
    if (!cliente) {
      await ctx.reply('Ese cliente ya no está. Búscalo otra vez.');
      return;
    }
    registro.clienteId = cliente.id;
    registro.clienteNombre = cliente.nombreTelegram ?? undefined;
    registro.paso = 'pago';
    await ctx.reply(
      `Cliente: ${cliente.nombreTelegram || cliente.telegramChatId}`,
    );
    await this.preguntarPago(ctx);
  }

  private async preguntarPago(ctx: CtxConSesion): Promise<void> {
    await ctx.reply(
      '¿Cómo te pagó?',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('Efectivo', 'rm_pago:efectivo'),
          Markup.button.callback('Tarjeta', 'rm_pago:tarjeta'),
        ],
        [Markup.button.callback('Transferencia', 'rm_pago:transferencia')],
        [Markup.button.callback('Cancelar', 'rm_cancelar')],
      ]),
    );
  }

  async elegirPago(ctx: CtxConSesion, metodo: string): Promise<void> {
    const registro = this.enCurso(ctx);
    if (!registro) return;
    registro.metodoPago = metodo as RegistroManualEnCurso['metodoPago'];
    registro.paso = 'monto';
    await ctx.reply(
      '¿Cuánto cobraste en total? Solo el número, por ejemplo 2400',
    );
  }

  private async preguntarUbicacion(ctx: CtxConSesion): Promise<void> {
    const lugares = await this.transportOperations
      .activeLocations()
      .catch(() => []);
    const botones = lugares
      .slice(0, 8)
      .map((lugar) => [
        Markup.button.callback(lugar.name, `rm_lugar:${lugar.id}`),
      ]);
    botones.push([Markup.button.callback('Otro lugar', 'rm_lugar:otro')]);
    botones.push([Markup.button.callback('Cancelar', 'rm_cancelar')]);
    await ctx.reply('¿Dónde fue?', Markup.inlineKeyboard(botones));
  }

  async elegirUbicacion(ctx: CtxConSesion, lugarId: string): Promise<void> {
    const registro = this.enCurso(ctx);
    if (!registro) return;

    if (lugarId === 'otro') {
      registro.paso = 'ubicacion_otra';
      await ctx.reply('Escribe dónde fue.');
      return;
    }
    const lugares = await this.transportOperations
      .activeLocations()
      .catch(() => []);
    const lugar = lugares.find((item) => item.id === lugarId);
    registro.ubicacion = lugar?.name ?? 'Sin especificar';
    registro.paso = 'motivo';
    await ctx.reply(
      '¿Por qué no pasó por el sistema? Tu jefe lee esto para autorizarlo.',
    );
  }

  /**
   * Texto libre del formulario.
   *
   * Devuelve `true` cuando el mensaje era una respuesta a este asistente, para
   * que quien lo llama no siga procesandolo como un mensaje normal.
   */
  async manejarTexto(ctx: CtxConSesion): Promise<boolean> {
    const registro = this.enCurso(ctx);
    if (!registro) return false;
    const texto = ((ctx.message as { text?: string })?.text ?? '').trim();
    if (!texto) return false;

    switch (registro.paso) {
      case 'fecha':
        return this.recibirFecha(ctx, registro, texto);
      case 'hora':
        return this.recibirHora(ctx, registro, texto);
      case 'duracion':
        return this.recibirDuracion(ctx, registro, texto);
      case 'cliente_busqueda':
        return this.recibirBusqueda(ctx, texto);
      case 'cliente_nombre':
        registro.clienteNombre = texto.slice(0, 120);
        registro.paso = 'pago';
        await this.preguntarPago(ctx);
        return true;
      case 'monto':
        return this.recibirMonto(ctx, registro, texto);
      case 'ubicacion_otra':
        registro.ubicacion = texto.slice(0, 200);
        registro.paso = 'motivo';
        await ctx.reply(
          '¿Por qué no pasó por el sistema? Tu jefe lee esto para autorizarlo.',
        );
        return true;
      case 'motivo':
        if (texto.length < 5) {
          await ctx.reply('Cuéntame un poco más, con eso no basta.');
          return true;
        }
        registro.motivo = texto.slice(0, 1000);
        registro.paso = 'confirmar';
        await this.mostrarResumen(ctx, registro);
        return true;
      default:
        return false;
    }
  }

  private async recibirFecha(
    ctx: CtxConSesion,
    registro: RegistroManualEnCurso,
    texto: string,
  ): Promise<boolean> {
    // dd/mm/aaaa hh:mm, que es como se escribe una fecha aqui.
    const match = texto.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[\s,]+(\d{1,2}):(\d{2}))?$/,
    );
    if (!match) {
      await ctx.reply('No entendí la fecha. Escríbela así: 24/08/2026 22:30');
      return true;
    }
    const [, dia, mes, anio, hora, minuto] = match;
    const fecha = new Date(
      Number(anio),
      Number(mes) - 1,
      Number(dia),
      Number(hora ?? 0),
      Number(minuto ?? 0),
    );
    if (Number.isNaN(fecha.getTime())) {
      await ctx.reply('Esa fecha no existe. Escríbela así: 24/08/2026 22:30');
      return true;
    }
    registro.fecha = fecha.toISOString();
    if (hora === undefined) {
      registro.paso = 'hora';
      await ctx.reply('¿A qué hora empezó? Escríbela así: 22:30');
      return true;
    }
    registro.paso = 'duracion';
    await this.preguntarDuracion(ctx);
    return true;
  }

  private async recibirHora(
    ctx: CtxConSesion,
    registro: RegistroManualEnCurso,
    texto: string,
  ): Promise<boolean> {
    const match = texto.match(/^(\d{1,2})[:.](\d{2})$/);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) {
      await ctx.reply('No entendí la hora. Escríbela así: 22:30');
      return true;
    }
    const fecha = new Date(registro.fecha ?? Date.now());
    fecha.setHours(Number(match[1]), Number(match[2]), 0, 0);
    registro.fecha = fecha.toISOString();
    registro.paso = 'duracion';
    await this.preguntarDuracion(ctx);
    return true;
  }

  private async preguntarDuracion(ctx: CtxConSesion): Promise<void> {
    await ctx.reply(
      '¿Cuántas horas duró?',
      Markup.inlineKeyboard([
        [1, 2, 3, 4].map((horas) =>
          Markup.button.callback(`${horas}`, `rm_dur:${horas}`),
        ),
        [Markup.button.callback('Cancelar', 'rm_cancelar')],
      ]),
    );
  }

  private async recibirDuracion(
    ctx: CtxConSesion,
    registro: RegistroManualEnCurso,
    texto: string,
  ): Promise<boolean> {
    const horas = Number(texto.replace(',', '.'));
    if (!Number.isFinite(horas) || horas <= 0 || horas > 24) {
      await ctx.reply('Dime las horas con un número, entre 1 y 24.');
      return true;
    }
    registro.duracionHoras = horas;
    registro.paso = 'cliente';
    await this.preguntarCliente(ctx);
    return true;
  }

  private async recibirBusqueda(
    ctx: CtxConSesion,
    texto: string,
  ): Promise<boolean> {
    const encontrados = await this.clientes.find({
      where: /^\d+$/.test(texto)
        ? [
            { nombreTelegram: ILike(`%${texto}%`) },
            { telegramChatId: ILike(`%${texto}%`) },
          ]
        : { nombreTelegram: ILike(`%${texto}%`) },
      take: MAX_RESULTADOS_BUSQUEDA,
      order: { createdAt: 'DESC' },
    });

    if (!encontrados.length) {
      await ctx.reply(
        'No encontré a nadie con eso. Prueba con otro nombre, o dime que no está registrado.',
        Markup.inlineKeyboard([
          [Markup.button.callback('No está registrado', 'rm_cli:libre')],
        ]),
      );
      return true;
    }

    await ctx.reply(
      'Elige a cuál te refieres:',
      Markup.inlineKeyboard([
        ...encontrados.map((cliente) => [
          Markup.button.callback(
            `${cliente.nombreTelegram || 'Sin nombre'} (${cliente.telegramChatId})`,
            `rm_cli_sel:${cliente.id}`,
          ),
        ]),
        [Markup.button.callback('Ninguno de estos', 'rm_cli:libre')],
      ]),
    );
    return true;
  }

  private async recibirMonto(
    ctx: CtxConSesion,
    registro: RegistroManualEnCurso,
    texto: string,
  ): Promise<boolean> {
    const monto = Number(texto.replace(/[^\d.,]/g, '').replace(',', '.'));
    if (!Number.isFinite(monto) || monto <= 0) {
      await ctx.reply('Dime cuánto cobraste con un número, por ejemplo 2400');
      return true;
    }
    registro.montoCobrado = monto;
    registro.paso = 'ubicacion_otra';
    await this.preguntarUbicacion(ctx);
    return true;
  }

  private formatearFecha(iso?: string): string {
    if (!iso) return 'Sin fecha';
    return new Date(iso).toLocaleString(APP_LOCALE, {
      timeZone: APP_TIME_ZONE,
      dateStyle: 'short',
      timeStyle: 'short',
    });
  }

  private async mostrarResumen(
    ctx: CtxConSesion,
    registro: RegistroManualEnCurso,
  ): Promise<void> {
    const cliente =
      registro.clienteNombre ||
      (registro.clienteId ? 'Cliente registrado' : 'Sin identificar');
    await ctx.reply(
      [
        'Esto es lo que le voy a mandar a tu jefe:',
        '',
        `Fecha: ${this.formatearFecha(registro.fecha)}`,
        `Duración: ${registro.duracionHoras} h`,
        `Cliente: ${cliente}`,
        `Pago: ${registro.metodoPago}`,
        `Cobrado: $${registro.montoCobrado}`,
        `Lugar: ${registro.ubicacion ?? 'Sin especificar'}`,
        `Motivo: ${registro.motivo}`,
      ].join('\n'),
      Markup.inlineKeyboard([
        [Markup.button.callback('Enviar a mi jefe', 'rm_enviar')],
        [Markup.button.callback('Cancelar', 'rm_cancelar')],
      ]),
    );
  }

  /** Crea la solicitud y se la manda al jefe con sus botones. */
  async enviar(ctx: CtxConSesion): Promise<void> {
    const registro = this.enCurso(ctx);
    const telegramId = ctx.from?.id?.toString();
    if (!registro || !telegramId) return;
    if (registro.paso !== 'confirmar') return;

    const usuario = await this.usuarios.findOne({
      where: { telegramChatId: telegramId, rol: 'empleada' },
    });
    if (!usuario) {
      await ctx.reply('No pude validar tu perfil de empleada.');
      return;
    }

    let solicitud: SolicitudServicioManual;
    try {
      solicitud = await this.manualServices.crear(usuario.id, {
        clienteId: registro.clienteId,
        clienteNombreLibre: registro.clienteNombre,
        fechaServicio: registro.fecha!,
        duracionHoras: registro.duracionHoras!,
        metodoPago: registro.metodoPago!,
        montoCobrado: registro.montoCobrado!,
        ubicacion: registro.ubicacion,
        motivo: registro.motivo!,
      });
    } catch (error) {
      await ctx.reply(
        `No se pudo enviar: ${error instanceof Error ? error.message : 'inténtalo de nuevo'}`,
      );
      return;
    }

    if (ctx.session) ctx.session.registroManual = undefined;
    await ctx.reply(
      'Listo, se lo mandé a tu jefe. Te aviso en cuanto lo revise.',
    );
    await this.avisarAlJefe(solicitud);
  }

  private async avisarAlJefe(
    solicitud: SolicitudServicioManual,
  ): Promise<void> {
    const jefe = await this.usuarios.findOne({
      where: { id: solicitud.jefeId },
    });
    const destino = jefe?.grupoTelegramId || jefe?.telegramChatId;
    if (!destino) {
      this.logger.warn(
        `La solicitud ${solicitud.id} no tiene a donde avisar: el jefe no tiene grupo ni chat.`,
      );
      return;
    }

    const cliente =
      solicitud.cliente?.nombreTelegram ||
      solicitud.clienteNombreLibre ||
      'Sin identificar';
    const texto = [
      'Registro de un servicio hecho fuera del sistema',
      '',
      `Empleada: ${solicitud.empleada?.nombreArtistico ?? 'Sin nombre'}`,
      `Fecha: ${this.formatearFecha(solicitud.fechaServicio.toISOString())}`,
      `Duración: ${Number(solicitud.duracionHoras)} h`,
      `Cliente: ${cliente}`,
      `Pago: ${solicitud.metodoPago}`,
      `Cobrado: $${Number(solicitud.montoCobrado).toFixed(2)}`,
      `Lugar: ${solicitud.ubicacion ?? 'Sin especificar'}`,
      '',
      `Motivo: ${solicitud.motivo}`,
      '',
      'Si lo autorizas, el servicio se registra ya finalizado y entra en su corte.',
    ].join('\n');

    try {
      await this.bot.telegram.sendMessage(destino, texto, {
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('Autorizar', `rm_jefe:ok:${solicitud.id}`),
            Markup.button.callback('Rechazar', `rm_jefe:no:${solicitud.id}`),
          ],
        ]),
      });
    } catch (error) {
      this.logger.error(
        `No se pudo avisar al jefe de la solicitud ${solicitud.id}: ${describeError(error)}`,
      );
    }
  }

  /** Avisa a la empleada de lo que su jefe decidió. */
  async avisarResolucionAEmpleada(
    solicitud: SolicitudServicioManual,
  ): Promise<void> {
    const usuario = await this.usuarios.findOne({
      where: { id: solicitud.empleada?.usuarioId ?? '' },
    });
    const chatId = usuario?.telegramChatId;
    if (!chatId) return;

    const texto =
      solicitud.estado === 'aprobada'
        ? [
            'Tu jefe autorizó el servicio que registraste.',
            `Ya cuenta en tu corte por $${Number(solicitud.montoCobrado).toFixed(2)}.`,
            solicitud.notaResolucion ? `Nota: ${solicitud.notaResolucion}` : '',
          ]
            .filter(Boolean)
            .join('\n')
        : [
            'Tu jefe no autorizó el servicio que registraste.',
            `Motivo: ${solicitud.notaResolucion ?? 'sin detalle'}`,
          ].join('\n');

    await this.bot.telegram
      .sendMessage(chatId, texto)
      .catch((error: unknown) =>
        this.logger.warn(
          `No se pudo avisar a la empleada de la solicitud ${solicitud.id}: ${describeError(error)}`,
        ),
      );
  }
}
