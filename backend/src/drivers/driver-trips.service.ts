import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Markup } from 'telegraf';
import { Viajes } from '../trips/entities/trip.entity';
import { Choferes } from './entities/driver.entity';
import { Servicios } from '../services/entities/service.entity';
import { RealtimeEventsService } from '../realtime/realtime.service';
import { SettlementsService } from '../transport-operations/settlements.service';
import { AiMessageService } from '../ai/ai-message.service';
import { ServicesService } from '../services/services.service';
import { TelegramService } from '../telegram/telegram.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Lo que la modelo tiene de margen antes de que se le cuente la espera. */
const ESPERA_MS = 600_000;

/**
 * El avance de un viaje, contado desde el lado del chofer.
 *
 * Existe porque estas transiciones vivian enteras dentro de los manejadores de
 * Telegram, mezcladas con la edicion de mensajes y los teclados, y por eso el
 * portal del chofer no las tenia: no habia nada que llamar desde HTTP.
 *
 * Aqui vive solo el negocio --validar, cambiar el estado y avisar a quien
 * corresponda--; lo que es propio del chat, como reescribir el mensaje del
 * chofer con el boton siguiente, se queda en el manejador. Los dos caminos
 * llaman a esto, de modo que marcar la llegada desde el portal y marcarla
 * desde el chat hacen exactamente lo mismo.
 */
@Injectable()
export class DriverTripsService {
  private readonly logger = new Logger(DriverTripsService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Viajes)
    private readonly viajes: Repository<Viajes>,
    @InjectRepository(Choferes)
    private readonly choferes: Repository<Choferes>,
    @InjectRepository(Servicios)
    private readonly servicios: Repository<Servicios>,
    private readonly realtime: RealtimeEventsService,
    private readonly settlements: SettlementsService,
    private readonly notifications: NotificationsService,
    private readonly aiMessages: AiMessageService,
    // Se usa el servicio y no el bot crudo: ahi vive el limitador de ritmo
    // por el que tiene que pasar todo lo que sale hacia Telegram.
    @Inject(forwardRef(() => TelegramService))
    private readonly telegram: TelegramService,
    @Inject(forwardRef(() => ServicesService))
    private readonly servicesService: ServicesService,
  ) {}

  /**
   * Manda un aviso push sin que su fallo arrastre a nada.
   *
   * El viaje ya avanzo cuando esto se llama: un aviso que no sale se registra y
   * se sigue.
   */
  private async avisar(
    usuarioId: string | null | undefined,
    aviso: {
      titulo: string;
      cuerpo: string;
      url: string;
      tag?: string;
      requireInteraction?: boolean;
    },
  ): Promise<void> {
    if (!usuarioId) return;
    try {
      await this.notifications.notificar(usuarioId, aviso);
    } catch (err) {
      this.logger.error(`Error enviando el aviso push "${aviso.titulo}":`, err);
    }
  }

  /**
   * El chofer toma una oferta de viaje.
   *
   * La oferta se manda a varios a la vez, asi que esto es una carrera: gana
   * quien escriba primero. La condicion va dentro del propio UPDATE --id, su
   * chofer y estado `notificado`-- de modo que la base decide, no el codigo.
   * Comprobar antes y escribir despues dejaria una ventana en la que dos
   * choferes se llevan el mismo viaje.
   *
   * Si no gana, no es un error: alguien fue mas rapido, y quien llama debe
   * decirlo con esas palabras.
   */
  async aceptarOferta(
    viajeId: string,
    choferId: string,
  ): Promise<{ aceptado: boolean; viaje: Viajes | null }> {
    const gano = await this.dataSource.transaction(async (manager) => {
      const resultado = await manager
        .createQueryBuilder()
        .update(Viajes)
        .set({
          estado: 'aceptado',
          horaAceptacion: new Date(),
          // La oferta deja de estar viva: sin limpiarlo, el barrido de ofertas
          // vencidas la tomaria como pendiente.
          ofertaExpiraEn: null,
        })
        .where('id = :viajeId AND chofer_id = :choferId AND estado = :estado', {
          viajeId,
          choferId,
          estado: 'notificado',
        })
        .execute();

      if (resultado.affected !== 1) return false;

      await manager.update(Choferes, choferId, {
        disponible: false,
        // Aceptar borra la racha: el contador mide rechazos SEGUIDOS, y sin
        // este reinicio tres rechazos sueltos repartidos en semanas acabarian
        // multando igual que tres seguidos.
        rechazosConsecutivos: 0,
      });
      return true;
    });

    if (!gano) return { aceptado: false, viaje: null };

    // Ya es suyo: se detiene el reparto para que no se lo ofrezcan a nadie mas.
    this.servicesService.clearDispatchTimeout(viajeId);

    const viaje = await this.cargarViajeDelChofer(viajeId, choferId);
    const chofer = await this.choferes.findOne({ where: { id: choferId } });

    await this.avisarAlJefe(
      viaje,
      chofer,
      'Viaje aceptado',
      `El chofer *${chofer?.nombre ?? ''}* acepto el viaje de la empleada *${viaje.servicio?.empleada?.nombreArtistico || ''}* y va en camino.`,
    );

    await this.avisarALaModeloQueVaEnCamino(viaje, chofer);

    this.realtime.emitToDriver(choferId, {
      type: 'trip_accepted',
      data: { tripId: viajeId },
    });
    if (viaje.servicio) {
      this.realtime.emitToEmployee(viaje.servicio.empleadaId, {
        type: 'trip_accepted',
        data: { tripId: viajeId, serviceId: viaje.servicio.id },
      });
      this.realtime.emitToBoss(viaje.servicio.jefeId, {
        type: 'trip_accepted',
        data: { tripId: viajeId, serviceId: viaje.servicio.id },
      });
    }

    return { aceptado: true, viaje };
  }

  /**
   * Le dice a la modelo que su chofer ya va en camino.
   *
   * Lleva los datos con los que identificara el coche, y el id del mensaje se
   * guarda porque se borra mas adelante, cuando ella ya subio: si no, el aviso
   * se queda en su conversacion mucho despues de dejar de ser cierto.
   */
  private async avisarALaModeloQueVaEnCamino(
    trip: Viajes,
    chofer: Choferes | null,
  ): Promise<void> {
    const chatId = trip.servicio?.empleada?.usuario?.telegramChatId;
    if (!chatId) return;

    const vehiculo = [
      chofer?.vehiculoMarca ? `• *Marca:* ${chofer.vehiculoMarca}` : null,
      chofer?.vehiculoModelo ? `• *Modelo:* ${chofer.vehiculoModelo}` : null,
      chofer?.vehiculoColor ? `• *Color:* ${chofer.vehiculoColor}` : null,
      chofer?.vehiculoPlaca ? `• *Placa:* ${chofer.vehiculoPlaca}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const texto =
      `*¡Tu chofer va en camino!*\n\n` +
      `El chofer *${chofer?.nombre ?? ''}* ha aceptado tu viaje y se dirige a tu ubicación.\n\n` +
      `*Datos del Chofer:*\n` +
      `• *Nombre:* ${chofer?.nombre ?? 'No registrado'}\n` +
      `• *Teléfono:* ${chofer?.telefono ?? 'No registrado'}\n\n` +
      (vehiculo
        ? `*Datos del Vehículo:*\n${vehiculo}\n`
        : `*Datos del Vehículo:* No registrados\n`);

    try {
      const enviado = await this.telegram.sendMessage(chatId, texto, {
        parseMode: 'Markdown',
      });
      // Nivel 1: tiene que estar lista cuando el coche llegue.
      await this.avisar(trip.servicio?.empleada?.usuarioId, {
        titulo: 'Tu chofer va en camino',
        cuerpo: 'Toca para ver los datos del coche.',
        url: '/empleada/portal',
        tag: `viaje-${trip.id}`,
        requireInteraction: true,
      });

      trip.telegramEmpleadaMsgChoferCaminoId = enviado.message_id.toString();
      await this.viajes.update(trip.id, {
        telegramEmpleadaMsgChoferCaminoId:
          trip.telegramEmpleadaMsgChoferCaminoId,
      });
    } catch (err) {
      this.logger.error(
        `No se pudo avisar a la empleada de que el chofer va en camino (chat ${chatId}):`,
        err,
      );
    }
  }

  /**
   * El chofer deja pasar una oferta.
   *
   * El rechazo en si --la racha, la reoferta al siguiente-- ya vivia en
   * `ServicesService`; aqui solo se le devuelve la disponibilidad, que es lo
   * que hacia el manejador del chat despues de llamarlo.
   */
  async rechazarOferta(viajeId: string, choferId: string): Promise<void> {
    await this.servicesService.rechazarOfertaManual(viajeId, choferId);
    await this.choferes.update(choferId, { disponible: true });
  }

  /**
   * El chofer llego al punto de recogida.
   *
   * Avisa a la modelo con los datos con los que puede identificar el coche
   * --es su unica forma de saber que se sube al correcto-- y le arranca el
   * margen de espera. Y deja constancia en el grupo del jefe.
   */
  async marcarLlegada(viajeId: string, choferId: string): Promise<Viajes> {
    const trip = await this.cargarViajeDelChofer(viajeId, choferId);

    if (trip.estado !== 'aceptado') {
      throw new ConflictException(`El viaje está en estado: ${trip.estado}`);
    }

    await this.viajes.update(trip.id, { estado: 'llegado' });
    trip.estado = 'llegado';

    const chofer = await this.choferes.findOne({ where: { id: choferId } });

    await this.avisarAlJefe(
      trip,
      chofer,
      'Chofer llegó al punto de recogida',
      `El chofer *${chofer?.nombre ?? ''}* ya llegó a la ubicación para recoger a la empleada *${trip.servicio?.empleada?.nombreArtistico || ''}*.`,
    );
    await this.avisarLlegadaALaEmpleada(trip, chofer);

    return trip;
  }

  /**
   * La modelo ya subio al coche y arranca el trayecto al cliente.
   *
   * Cancela el margen de espera --ya no procede cobrarlo-- y retira del chat
   * de la modelo los avisos que dejaron de ser ciertos: el de que el chofer va
   * en camino y el de que ha llegado.
   *
   * Admite venir de `llegado` y tambien de `aceptado`, igual que antes: hay
   * choferes que recogen sin llegar a marcar la llegada, y bloquearlo dejaria
   * el viaje atascado.
   */
  async marcarRecogida(viajeId: string, choferId: string): Promise<Viajes> {
    const trip = await this.cargarViajeDelChofer(viajeId, choferId);

    if (trip.estado !== 'llegado' && trip.estado !== 'aceptado') {
      throw new ConflictException(`El viaje está en estado: ${trip.estado}`);
    }

    const ahora = new Date();
    await this.viajes.update(trip.id, {
      estado: 'en_curso',
      horaInicioViaje: ahora,
    });
    trip.estado = 'en_curso';
    trip.horaInicioViaje = ahora;

    // La espera deja de contar en cuanto sube al coche.
    this.servicesService.clearWaitTimeout(trip.servicioId);

    const chofer = await this.choferes.findOne({ where: { id: choferId } });

    await this.avisarAlJefe(
      trip,
      chofer,
      'Empleada recogida',
      `El chofer *${chofer?.nombre ?? ''}* ya recogió a la empleada *${trip.servicio?.empleada?.nombreArtistico || ''}* e inició el trayecto al destino.`,
    );
    await this.retirarAvisosDeCamino(trip);

    return trip;
  }

  /**
   * Quita del chat de la modelo los avisos que ya no son ciertos.
   *
   * Sin esto, "tu chofer ha llegado" se quedaba en su conversacion mucho
   * despues de haber subido al coche, compitiendo con lo que si importa.
   */
  private async retirarAvisosDeCamino(trip: Viajes): Promise<void> {
    const chatId = trip.servicio?.empleada?.usuario?.telegramChatId;
    if (!chatId) return;

    for (const id of [
      trip.telegramEmpleadaMsgChoferCaminoId,
      trip.telegramEmpleadaMsgChoferLlegadoId,
    ]) {
      if (!id) continue;
      // `deleteMessage` ya se traga sus propios fallos: un mensaje que el
      // usuario borro, o mas viejo de lo que Telegram deja retirar, no puede
      // impedir que el viaje avance.
      await this.telegram.deleteMessage(chatId, parseInt(id, 10));
    }
  }

  /**
   * El viaje termino.
   *
   * Es la transicion con mas cola de las tres, y la unica que toca dinero: al
   * cerrar un viaje de regreso decide el estado de liquidacion del servicio y
   * dispara el recibo final al cliente. Por eso conserva el orden exacto de
   * los efectos que tenia en el chat, incluida la escritura en paralelo.
   *
   * Lo que cambia segun el tramo:
   *  - ida: el servicio arranca de verdad, y si estaba agendado pasa a en_curso.
   *  - regreso: se anota la llegada a casa, se cierra la liquidacion --salvo que
   *    quede cobro final pendiente-- y se cierra el tema del grupo.
   */
  async finalizarViaje(viajeId: string, choferId: string): Promise<Viajes> {
    const trip = await this.cargarViajeDelChofer(viajeId, choferId);

    if (trip.estado !== 'en_curso') {
      throw new ConflictException(`El viaje está en estado: ${trip.estado}`);
    }

    const horaFin = new Date();
    trip.estado = 'finalizado';
    trip.horaFinViaje = horaFin;

    const chofer = await this.choferes.findOne({ where: { id: choferId } });

    await this.avisarAlJefe(
      trip,
      chofer,
      'Viaje finalizado',
      `El chofer *${chofer?.nombre ?? ''}* ha dejado a la empleada *${trip.servicio?.empleada?.nombreArtistico || ''}* en su destino y finalizó el viaje.`,
    );

    const escrituras: Promise<unknown>[] = [];
    const veniaAgendado = trip.servicio?.estado === 'agendado';

    escrituras.push(
      this.viajes.update(trip.id, {
        estado: 'finalizado',
        horaFinViaje: horaFin,
      }),
    );
    // El chofer vuelve a estar libre en cuanto suelta a la pasajera.
    escrituras.push(this.choferes.update(choferId, { disponible: true }));

    if (trip.servicio) {
      const cambios: Partial<Servicios> = {};

      if (trip.tipo === 'ida') {
        const horaInicio = new Date();
        trip.servicio.horaInicioServicio = horaInicio;
        cambios.horaInicioServicio = horaInicio;
        if (trip.servicio.estado === 'agendado') {
          trip.servicio.estado = 'en_curso';
          cambios.estado = 'en_curso';
          cambios.servicioPrevioId = null;
          cambios.horaInicioEstimada = horaInicio;
        }
      } else {
        const horaLlegada = new Date();
        trip.servicio.horaLlegadaCasa = horaLlegada;
        cambios.horaLlegadaCasa = horaLlegada;
        /*
         * Si todavia falta el cobro final por transferencia (duracion
         * abierta), no se puede dar por cerrada la liquidacion: el mismo
         * criterio que ya usa el camino de Uber en updateUberStatus.
         */
        cambios.estadoLiquidacion = trip.servicio.cobroFinalPendiente
          ? 'transporte_pendiente'
          : 'cerrada';

        escrituras.push(this.cerrarTemaDelServicio(trip));
      }

      escrituras.push(this.servicios.update(trip.servicio.id, cambios));
    }

    await Promise.all(escrituras);

    await this.settlements
      .syncDriverSettlement(trip.id)
      .catch((error) =>
        this.logger.error(
          `El viaje ${trip.id} finalizó, pero no se pudo sincronizar su liquidación`,
          error,
        ),
      );

    if (trip.tipo === 'ida' && veniaAgendado && trip.servicio) {
      await this.servicesService.notifyScheduledServiceStarted(
        trip.servicio.id,
      );
    }

    if (trip.tipo === 'regreso' && trip.servicio) {
      await this.cerrarServicioDeRegreso(trip);
    }

    // Estos dos van al final y fuera de las ramas, igual que estaban en el
    // chat: la calificacion se pide siempre, y al cliente se le avisa solo
    // cuando el viaje que termina es el de ida, que es cuando llega ella.
    await this.pedirCalificacionAlaEmpleada(trip, chofer);
    await this.pedirCalificacionAlChofer(trip);
    if (trip.tipo === 'ida') await this.avisarLlegadaAlCliente(trip);

    return trip;
  }

  /**
   * Le pide al chofer que califique a la empleada del viaje.
   *
   * En el chat esto viajaba pegado a la reescritura de su propio mensaje, asi
   * que cerrar desde el portal no se lo pedia y esa valoracion se perdia. Sale
   * a su chat aunque haya cerrado en la aplicacion: los botones de calificar
   * son de Telegram y no hay pantalla equivalente todavia.
   */
  private async pedirCalificacionAlChofer(trip: Viajes): Promise<void> {
    if (!trip.choferId) return;
    const chofer = await this.choferes.findOne({
      where: { id: trip.choferId },
      relations: { usuario: true },
    });
    const chatId = chofer?.usuario?.telegramChatId;
    if (!chatId) return;

    await this.telegram
      .sendMessage(
        chatId,
        `Califica a ${trip.servicio?.empleada?.nombreArtistico ?? 'la empleada'} por este viaje.`,
        {
          buttons: [
            [1, 2, 3, 4, 5].map((estrellas) =>
              Markup.button.callback(
                `${estrellas}`,
                `rate_emp_trip:${trip.id}:${estrellas}`,
              ),
            ),
          ],
        },
      )
      .catch(() => undefined);
  }

  /** Le pide a la modelo que califique el trayecto recien terminado. */
  private async pedirCalificacionAlaEmpleada(
    trip: Viajes,
    chofer: Choferes | null,
  ): Promise<void> {
    const chatId = trip.servicio?.empleada?.usuario?.telegramChatId;
    if (!chatId) return;

    await this.telegram
      .sendMessage(
        chatId,
        `Califica el trayecto realizado por ${chofer?.nombre ?? 'tu chofer'}.`,
        {
          buttons: [
            [1, 2, 3, 4, 5].map((estrellas) =>
              Markup.button.callback(
                `${estrellas}`,
                `rate_driver_trip:${trip.id}:${estrellas}`,
              ),
            ),
          ],
        },
      )
      .catch(() => undefined);
  }

  /**
   * Le avisa al cliente de que la modelo ya llego.
   *
   * Solo al terminar la ida. El texto lo redacta la IA en personaje; si falla,
   * sale el de reserva, porque el cliente tiene que enterarse igual.
   */
  private async avisarLlegadaAlCliente(trip: Viajes): Promise<void> {
    const chatId = trip.servicio?.cliente?.telegramChatId;
    if (!chatId) return;

    try {
      const mensaje = await this.aiMessages.generate(
        'employee_arrived',
        { employeeName: trip.servicio?.empleada?.nombreArtistico },
        'Ya llegué al punto que cuadramos, aquí te espero',
      );
      await this.telegram.sendMessage(chatId, mensaje);
    } catch (err) {
      this.logger.error(
        `No se pudo avisar al cliente de la llegada (chat ${chatId}):`,
        err,
      );
    }
  }

  /**
   * Avisa al grupo del jefe y cierra el tema del servicio.
   *
   * Solo al terminar el regreso: ahi el servicio esta completo y su hilo ya no
   * tiene mas que decir.
   */
  private async cerrarTemaDelServicio(trip: Viajes): Promise<void> {
    const servicio = trip.servicio;
    if (!servicio) return;

    const grupoId =
      servicio.jefe?.grupoTelegramId ||
      servicio.empleada?.jefe?.grupoTelegramId;
    if (!servicio.telegramThreadId || !grupoId) return;

    const threadId = parseInt(servicio.telegramThreadId, 10);
    try {
      await this.telegram.sendMessage(
        grupoId,
        `La empleada ${servicio.empleada?.nombreArtistico ?? ''} llegó a su destino. El servicio quedó completado.`,
        { threadId },
      );
      await this.telegram.deleteForumTopic(grupoId, threadId);
      await this.servicios.update(servicio.id, { telegramThreadId: null });
    } catch (err) {
      this.logger.error(
        'No se pudo cerrar el tema del servicio al finalizar el regreso:',
        err,
      );
    }
  }

  /**
   * El cierre de cara al cliente cuando termina el viaje de regreso.
   *
   * Manda la cuenta definitiva y la invitacion a calificar. Con chofer propio
   * esto no lo hacia nadie: solo ocurria por las rutas de Uber, asi que un
   * servicio con transporte interno se quedaba sin recibo.
   */
  private async cerrarServicioDeRegreso(trip: Viajes): Promise<void> {
    const servicio = trip.servicio;
    if (!servicio) return;

    if (servicio.cliente?.telegramChatId) {
      await this.telegram
        .sendMessage(
          servicio.cliente.telegramChatId,
          'El servicio quedó completado: la empleada llegó a su destino.',
        )
        .catch(() => undefined);
    }

    await this.servicesService
      .sendFinalReceiptAndAward(servicio.id)
      .catch((error) =>
        this.logger.error(
          `No se pudo enviar el recibo final del servicio ${servicio.id}:`,
          error,
        ),
      );

    this.realtime.emitToBoss(servicio.jefeId, {
      type: 'trip_status_updated',
      data: {
        serviceId: trip.servicioId,
        tripId: trip.id,
        state: 'finalizado',
        tripType: 'regreso',
      },
    });
    if (servicio.clienteId) {
      this.realtime.emitToClient(servicio.clienteId, {
        type: 'service_fully_completed',
        data: { serviceId: trip.servicioId, tripId: trip.id },
      });
    }
  }

  /**
   * El chofer que hay detras del usuario de la sesion del portal.
   *
   * El guard del portal deja el id de usuario, no el de chofer, y las
   * transiciones razonan sobre el chofer porque es lo que tiene el viaje.
   */
  async choferDeUsuario(usuarioId: string): Promise<string> {
    const chofer = await this.choferes.findOne({
      where: { usuarioId },
      select: { id: true },
    });
    if (!chofer) {
      throw new NotFoundException('No se encontró tu perfil de chofer');
    }
    return chofer.id;
  }

  /**
   * Carga el viaje comprobando que sea de quien dice serlo.
   *
   * La comprobacion vive aqui y no en cada llamador para que el portal y el
   * chat no puedan divergir: quien entra por HTTP trae su id de chofer del
   * guard, y quien entra por el chat lo trae de su chat vinculado, pero la
   * regla que decide es la misma.
   */
  private async cargarViajeDelChofer(
    viajeId: string,
    choferId: string,
  ): Promise<Viajes> {
    const trip = await this.viajes.findOne({
      where: { id: viajeId },
      relations: {
        servicio: {
          cliente: true,
          jefe: true,
          empleada: { usuario: true, jefe: true },
        },
      },
    });

    if (!trip) throw new NotFoundException('Viaje no encontrado');
    if (trip.choferId !== choferId) {
      throw new ForbiddenException('Este viaje está asignado a otro chofer');
    }
    return trip;
  }

  /**
   * Le manda a la modelo los datos del coche y arranca su margen de espera.
   *
   * El id del mensaje se guarda porque el chat lo borra despues, cuando el
   * viaje avanza: sin guardarlo, el aviso de "tu chofer llego" se quedaba en
   * la conversacion mucho despues de haber subido al coche.
   */
  private async avisarLlegadaALaEmpleada(
    trip: Viajes,
    chofer: Choferes | null,
  ): Promise<void> {
    const chatId = trip.servicio?.empleada?.usuario?.telegramChatId;
    if (!chatId || !trip.servicio) return;

    const vehiculo = [
      chofer?.vehiculoMarca ? `• *Marca:* ${chofer.vehiculoMarca}` : null,
      chofer?.vehiculoModelo ? `• *Modelo:* ${chofer.vehiculoModelo}` : null,
      chofer?.vehiculoColor ? `• *Color:* ${chofer.vehiculoColor}` : null,
      chofer?.vehiculoPlaca ? `• *Placa:* ${chofer.vehiculoPlaca}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const texto =
      `*¡Tu chofer ha llegado!*\n\n` +
      `El chofer *${chofer?.nombre ?? ''}* ya está fuera en el punto de recogida.\n\n` +
      `*Datos de Identificación del Chofer:*\n` +
      `• *Nombre:* ${chofer?.nombre ?? 'No registrado'}\n` +
      `• *Teléfono:* ${chofer?.telefono ?? 'No registrado'}\n\n` +
      (vehiculo
        ? `*Datos del Vehículo:*\n${vehiculo}\n`
        : `*Datos del Vehículo:* No registrados\n`) +
      `Por favor, reúnete con él para iniciar el viaje.`;

    try {
      const enviado = await this.telegram.sendMessage(chatId, texto, {
        parseMode: 'Markdown',
        buttons: [
          [
            Markup.button.callback(
              'Solicitar prórroga (10 min)',
              `pedir_prorroga:${trip.servicio.id}`,
            ),
          ],
        ],
      });

      // Nivel 1: desde aqui empieza a correr su margen de espera.
      await this.avisar(trip.servicio?.empleada?.usuarioId, {
        titulo: 'Tu chofer ya llegó',
        cuerpo: 'Está en el punto de recogida. Toca para ver sus datos.',
        url: '/empleada/portal',
        tag: `viaje-${trip.id}`,
        requireInteraction: true,
      });

      this.servicesService.startWaitTimeout(trip.servicio.id, ESPERA_MS);

      trip.telegramEmpleadaMsgChoferLlegadoId = enviado.message_id.toString();
      await this.viajes.update(trip.id, {
        telegramEmpleadaMsgChoferLlegadoId:
          trip.telegramEmpleadaMsgChoferLlegadoId,
      });
    } catch (err) {
      /*
       * Que no se pueda avisar por Telegram no deshace la llegada: el viaje ya
       * cambio de estado y el chofer esta fisicamente alli. Se registra y se
       * sigue.
       */
      this.logger.error(
        `No se pudo avisar a la empleada de la llegada (chat ${chatId}):`,
        err,
      );
    }
  }

  /** Deja constancia del avance en el grupo del jefe, en el tema del servicio. */
  private async avisarAlJefe(
    trip: Viajes,
    chofer: Choferes | null,
    titulo: string,
    detalle: string,
  ): Promise<void> {
    const servicio = trip.servicio;
    if (!servicio) return;

    const grupoId =
      servicio.jefe?.grupoTelegramId ||
      servicio.empleada?.jefe?.grupoTelegramId;
    const destino =
      grupoId ||
      servicio.jefe?.telegramChatId ||
      servicio.empleada?.jefe?.telegramChatId;
    if (!destino) return;

    const vehiculo = [
      chofer?.vehiculoMarca ? `• *Marca:* ${chofer.vehiculoMarca}` : null,
      chofer?.vehiculoModelo ? `• *Modelo:* ${chofer.vehiculoModelo}` : null,
      chofer?.vehiculoColor ? `• *Color:* ${chofer.vehiculoColor}` : null,
      chofer?.vehiculoPlaca ? `• *Placa:* ${chofer.vehiculoPlaca}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const texto =
      `*Actualización de Chofer:* ${titulo}\n\n` +
      `${detalle}\n\n` +
      `• *Chofer:* ${chofer?.nombre ?? ''}\n` +
      `• *Teléfono:* ${chofer?.telefono || 'No registrado'}\n` +
      `• *Empleada:* ${servicio.empleada?.nombreArtistico || 'N/A'}\n` +
      `• *Tipo de Viaje:* ${trip.tipo === 'ida' ? 'Ida (hacia cliente)' : 'Regreso (hacia domicilio)'}\n` +
      (vehiculo ? `\n*Datos del Vehículo:*\n${vehiculo}` : '');

    try {
      await this.telegram.sendMessage(destino, texto, {
        parseMode: 'Markdown',
        ...(grupoId && servicio.telegramThreadId
          ? { threadId: parseInt(servicio.telegramThreadId, 10) }
          : {}),
      });
    } catch (err) {
      this.logger.error(
        `No se pudo avisar al jefe del avance del viaje (destino ${destino}):`,
        err,
      );
    }
  }
}
