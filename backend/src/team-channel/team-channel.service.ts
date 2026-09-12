import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Markup } from 'telegraf';
import { MensajesEquipo } from './entities/team-message.entity';
import type { TipoMensajeEquipo } from './entities/team-message.entity';
import type {
  MensajeParaEmpleada,
  MensajeParaJefe,
} from './dto/team-channel.dto';
import { Empleadas } from '../employees/entities/employee.entity';
import { Usuarios } from '../users/entities/user.entity';
import { TelegramService } from '../telegram/telegram.service';
import { RealtimeEventsService } from '../realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Como se presenta quien coordina, del lado de la modelo. Nunca su nombre. */
export const NOMBRE_ANONIMO = 'Coordinación';

/** Cuantos mensajes se devuelven de una conversacion. */
const TOPE_HISTORIAL = 100;

/**
 * Canal de dudas entre una modelo y quien la coordina.
 *
 * Es anonimo de un solo lado a proposito: el jefe ve con quien habla --lo
 * necesita para coordinar-- y la modelo habla siempre con "Coordinación", sin
 * nombre, sin telefono y sin usuario de Telegram. Por eso ningun metodo
 * devuelve el autor hacia el portal de ella: `paraEmpleada` es el unico camino
 * de salida por ese lado, y ahi el autor no existe.
 *
 * El canal es opcional: nada del flujo operativo depende de el. Sirve para
 * resolver dudas, y de paso es por donde viaja la pregunta por el cierre de
 * jornada, que antes no tenia donde ocurrir.
 */
@Injectable()
export class TeamChannelService {
  private readonly logger = new Logger(TeamChannelService.name);

  /** Texto fijo de la pregunta por el cierre de jornada. */
  static readonly PREGUNTA_JORNADA =
    'Vimos que cerraste tu jornada. ¿Nos cuentas por qué? Con saberlo basta, es para organizar el resto del día.';

  constructor(
    @InjectRepository(MensajesEquipo)
    private readonly mensajes: Repository<MensajesEquipo>,
    @InjectRepository(Empleadas)
    private readonly empleadas: Repository<Empleadas>,
    @InjectRepository(Usuarios)
    private readonly usuarios: Repository<Usuarios>,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegram: TelegramService,
    private readonly realtime: RealtimeEventsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** La empleada detras de un id de usuario o de un id de empleada. */
  async resolverEmpleada(identificador: string): Promise<Empleadas> {
    const empleada = await this.empleadas.findOne({
      where: [{ usuarioId: identificador }, { id: identificador }],
      relations: { usuario: true },
    });
    if (!empleada) throw new NotFoundException('Empleada no encontrada');
    return empleada;
  }

  /**
   * Quien puede leer y escribir en el canal de una modelo.
   *
   * Un admin siempre; un jefe solo si es el suyo, principal o secundario. Sin
   * esto cualquier jefe podria abrir la conversacion privada de una modelo que
   * no coordina.
   */
  private assertPuedeCoordinar(actor: Usuarios, empleada: Empleadas): void {
    if (actor.rol === 'admin') return;
    if (
      actor.rol === 'jefe' &&
      (empleada.jefeId === actor.id || empleada.jefeSecundarioId === actor.id)
    ) {
      return;
    }
    throw new ForbiddenException('Esta modelo no es de tu equipo');
  }

  /**
   * A quien le llega lo que escribe la modelo.
   *
   * Sus dos jefes, y si no tiene ninguno asignado, cualquier jefe o admin
   * activo: un mensaje que no llega a nadie es peor que uno que llega a quien
   * no toca, porque ella se queda esperando una respuesta que nunca iba a
   * existir.
   */
  private async destinatarios(empleada: Empleadas): Promise<Usuarios[]> {
    const ids = [empleada.jefeId, empleada.jefeSecundarioId].filter(
      (id): id is string => Boolean(id),
    );

    const asignados = ids.length
      ? await this.usuarios.find({ where: { id: In(ids), activo: true } })
      : [];
    if (asignados.length > 0) return asignados;

    return this.usuarios.find({
      where: [
        { rol: 'jefe', activo: true },
        { rol: 'admin', activo: true },
      ],
      take: 5,
    });
  }

  // --------------------------------------------------------------- empleada

  /**
   * La conversacion como la ve la modelo, y de paso marcados como leidos los
   * mensajes que le habian mandado.
   */
  async listarParaEmpleada(usuarioId: string): Promise<MensajeParaEmpleada[]> {
    const empleada = await this.resolverEmpleada(usuarioId);
    const filas = await this.mensajes.find({
      where: { empleadaId: empleada.id },
      order: { createdAt: 'DESC' },
      take: TOPE_HISTORIAL,
    });

    const porLeer = filas
      .filter((fila) => fila.emisor === 'jefe' && !fila.leidoAt)
      .map((fila) => fila.id);
    if (porLeer.length > 0) {
      await this.mensajes.update(porLeer, { leidoAt: new Date() });
    }

    return filas.reverse().map((fila) => this.paraEmpleada(fila));
  }

  /** Cuantos mensajes de coordinacion tiene sin leer. */
  async sinLeerParaEmpleada(usuarioId: string): Promise<number> {
    const empleada = await this.empleadas.findOne({
      where: [{ usuarioId }, { id: usuarioId }],
      select: { id: true },
    });
    if (!empleada) return 0;
    return this.mensajes.count({
      where: { empleadaId: empleada.id, emisor: 'jefe', leidoAt: IsNull() },
    });
  }

  /**
   * La modelo escribe. Llega a sus jefes por Telegram, por el panel y por aviso
   * push, porque no hay forma de saber cual de los tres esta mirando.
   */
  async enviarDesdeEmpleada(
    usuarioId: string,
    cuerpo: string,
    tipo?: TipoMensajeEquipo,
  ): Promise<MensajeParaEmpleada> {
    const empleada = await this.resolverEmpleada(usuarioId);
    const texto = cuerpo.trim();
    if (!texto) throw new NotFoundException('El mensaje viene vacío');

    const tipoEfectivo = tipo ?? (await this.deducirTipo(empleada));

    const fila = await this.mensajes.save(
      this.mensajes.create({
        empleadaId: empleada.id,
        emisor: 'empleada',
        autorUserId: empleada.usuarioId,
        cuerpo: texto,
        tipo: tipoEfectivo,
      }),
    );

    await this.guardarMotivoDeJornadaSiProcede(empleada, texto, tipoEfectivo);
    await this.avisarALosJefes(empleada, fila);
    return this.paraEmpleada(fila);
  }

  /**
   * De que va lo que acaba de escribir, cuando quien lo manda no lo dice.
   *
   * Desde el chat no hay forma de declararlo: ella pulsa "Responder" y escribe.
   * Si lo ultimo que se le pregunto fue por que cerro su jornada y sigue
   * cerrada, lo que conteste es esa respuesta, no una duda suelta.
   */
  private async deducirTipo(empleada: Empleadas): Promise<TipoMensajeEquipo> {
    if (empleada.usuario?.enJornada !== false) return 'duda';
    const ultimo = await this.mensajes.findOne({
      where: { empleadaId: empleada.id, emisor: 'jefe' },
      order: { createdAt: 'DESC' },
    });
    return ultimo?.tipo === 'jornada' ? 'jornada' : 'duda';
  }

  /**
   * Deja el motivo del cierre donde el panel lo busca.
   *
   * El hilo guarda la conversacion, pero la ficha de la persona es donde se
   * mira "por que no esta hoy", y ahi tiene que estar la frase sin que nadie
   * abra el chat. Solo se escribe si sigue fuera de jornada y no lo habia dicho
   * ya: no se pisa lo que ella misma escribio al cerrar.
   */
  private async guardarMotivoDeJornadaSiProcede(
    empleada: Empleadas,
    texto: string,
    tipo: TipoMensajeEquipo,
  ): Promise<void> {
    if (tipo !== 'jornada') return;
    const usuario = empleada.usuario;
    if (!usuario || usuario.enJornada) return;
    if (usuario.jornadaMotivo) return;

    try {
      await this.usuarios.update(usuario.id, {
        jornadaMotivo: texto.slice(0, 500),
        jornadaMotivoAt: new Date(),
      });
    } catch (error) {
      this.logger.error('No se pudo guardar el motivo de la jornada:', error);
    }
  }

  // ------------------------------------------------------------------- jefe

  async listarParaJefe(
    actor: Usuarios,
    empleadaId: string,
  ): Promise<MensajeParaJefe[]> {
    const empleada = await this.resolverEmpleada(empleadaId);
    this.assertPuedeCoordinar(actor, empleada);

    const filas = await this.mensajes.find({
      where: { empleadaId: empleada.id },
      order: { createdAt: 'DESC' },
      take: TOPE_HISTORIAL,
      relations: { autor: true },
    });

    const porLeer = filas
      .filter((fila) => fila.emisor === 'empleada' && !fila.leidoAt)
      .map((fila) => fila.id);
    if (porLeer.length > 0) {
      await this.mensajes.update(porLeer, { leidoAt: new Date() });
    }

    return filas.reverse().map((fila) => ({
      id: fila.id,
      emisor: fila.emisor,
      autor:
        fila.emisor === 'jefe'
          ? this.nombreDe(fila.autor) || NOMBRE_ANONIMO
          : empleada.nombreArtistico,
      cuerpo: fila.cuerpo,
      tipo: fila.tipo,
      leidoAt: fila.leidoAt ? fila.leidoAt.toISOString() : null,
      createdAt: fila.createdAt.toISOString(),
    }));
  }

  /**
   * Mensajes sin leer por modelo, para pintar el aviso en el panel del jefe sin
   * tener que abrir cada conversacion.
   */
  async sinLeerParaJefe(actor: Usuarios): Promise<Record<string, number>> {
    const empleadas = await this.empleadas.find({
      where:
        actor.rol === 'admin'
          ? {}
          : [{ jefeId: actor.id }, { jefeSecundarioId: actor.id }],
      select: { id: true },
    });
    if (empleadas.length === 0) return {};

    const filas = await this.mensajes
      .createQueryBuilder('mensaje')
      .select('mensaje.empleada_id', 'empleadaId')
      .addSelect('COUNT(*)::int', 'total')
      .where('mensaje.empleada_id IN (:...ids)', {
        ids: empleadas.map((empleada) => empleada.id),
      })
      .andWhere('mensaje.emisor = :emisor', { emisor: 'empleada' })
      .andWhere('mensaje.leido_at IS NULL')
      .groupBy('mensaje.empleada_id')
      .getRawMany<{ empleadaId: string; total: number }>();

    return Object.fromEntries(
      filas.map((fila) => [fila.empleadaId, Number(fila.total)]),
    );
  }

  /**
   * El jefe escribe a una modelo. El mensaje sale del bot, no de su cuenta: es
   * lo que mantiene el anonimato sin que haya que recordarlo en cada envio.
   */
  async enviarDesdeJefe(
    actor: Usuarios,
    empleadaId: string,
    cuerpo: string,
    tipo: TipoMensajeEquipo = 'duda',
  ): Promise<MensajeParaJefe> {
    const empleada = await this.resolverEmpleada(empleadaId);
    this.assertPuedeCoordinar(actor, empleada);

    const texto = cuerpo.trim();
    if (!texto) throw new NotFoundException('El mensaje viene vacío');

    const fila = await this.mensajes.save(
      this.mensajes.create({
        empleadaId: empleada.id,
        emisor: 'jefe',
        autorUserId: actor.id,
        cuerpo: texto,
        tipo,
      }),
    );

    await this.avisarALaEmpleada(empleada, fila);

    return {
      id: fila.id,
      emisor: 'jefe',
      autor: this.nombreDe(actor) || NOMBRE_ANONIMO,
      cuerpo: fila.cuerpo,
      tipo: fila.tipo,
      leidoAt: null,
      createdAt: fila.createdAt.toISOString(),
    };
  }

  /**
   * El jefe pregunta por que cerro su jornada.
   *
   * Va por el canal y no por un mensaje suelto para que la respuesta tenga a
   * donde volver: ella contesta en el mismo hilo, desde el portal o desde el
   * chat, y el jefe la lee en los dos sitios.
   */
  async preguntarMotivoDeJornada(
    actor: Usuarios,
    empleadaId: string,
  ): Promise<MensajeParaJefe> {
    return this.enviarDesdeJefe(
      actor,
      empleadaId,
      TeamChannelService.PREGUNTA_JORNADA,
      'jornada',
    );
  }

  // ----------------------------------------------------------------- avisos

  private paraEmpleada(fila: MensajesEquipo): MensajeParaEmpleada {
    return {
      id: fila.id,
      // Lo unico que sale de este lado: quien habla, no quien es.
      emisor: fila.emisor === 'jefe' ? 'coordinacion' : 'empleada',
      cuerpo: fila.cuerpo,
      tipo: fila.tipo,
      createdAt: fila.createdAt.toISOString(),
    };
  }

  private nombreDe(usuario: Usuarios | null | undefined): string {
    if (!usuario) return '';
    return [usuario.nombre, usuario.apellido].filter(Boolean).join(' ').trim();
  }

  /**
   * Avisa a los jefes de lo que escribio la modelo.
   *
   * Nunca lanza: el mensaje ya esta guardado y lo peor que puede pasar es que
   * alguien se entere por el panel en vez de por el chat. Perderlo por un fallo
   * de Telegram seria mucho peor.
   */
  private async avisarALosJefes(
    empleada: Empleadas,
    fila: MensajesEquipo,
  ): Promise<void> {
    let jefes: Usuarios[] = [];
    try {
      jefes = await this.destinatarios(empleada);
    } catch (error) {
      this.logger.error('No se pudo resolver a quien avisar:', error);
      return;
    }

    for (const jefe of jefes) {
      this.realtime.emitToBoss(jefe.id, {
        type: 'team_channel_message',
        data: {
          empleadaId: empleada.id,
          empleada: empleada.nombreArtistico,
          emisor: 'empleada',
          tipo: fila.tipo,
        },
      });

      if (!jefe.telegramChatId) continue;
      try {
        await this.telegram.sendMessage(
          jefe.telegramChatId,
          `Mensaje de ${empleada.nombreArtistico}:\n\n${fila.cuerpo}`,
          {
            buttons: [
              [
                Markup.button.callback(
                  'Responder',
                  `canal_jefe:${empleada.id}`,
                ),
              ],
            ],
          },
        );
      } catch (error) {
        this.logger.error(
          `No se pudo avisar al jefe ${jefe.id} del mensaje de la modelo:`,
          error,
        );
      }
    }
  }

  /** Avisa a la modelo, sin decirle nunca de quien viene. */
  private async avisarALaEmpleada(
    empleada: Empleadas,
    fila: MensajesEquipo,
  ): Promise<void> {
    this.realtime.emitToEmployee(empleada.id, {
      type: 'team_channel_message',
      data: { emisor: 'coordinacion', tipo: fila.tipo },
    });

    try {
      await this.notifications.notificar(empleada.usuarioId, {
        titulo: `Mensaje de ${NOMBRE_ANONIMO}`,
        cuerpo: fila.cuerpo.slice(0, 120),
        url: '/empleada/portal?seccion=canal',
        tag: `canal-${empleada.id}`,
      });
    } catch (error) {
      this.logger.error('No se pudo mandar el aviso push del canal:', error);
    }

    const chatId = empleada.usuario?.telegramChatId;
    if (!chatId) return;
    try {
      await this.telegram.sendMessage(
        chatId,
        `${NOMBRE_ANONIMO}:\n\n${fila.cuerpo}`,
        {
          buttons: [
            [Markup.button.callback('Responder', `canal_emp:${empleada.id}`)],
          ],
        },
      );
    } catch (error) {
      this.logger.error(
        `No se pudo entregar el mensaje del canal a la modelo ${empleada.id}:`,
        error,
      );
    }
  }
}
