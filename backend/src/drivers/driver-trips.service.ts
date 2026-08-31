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
import { Repository } from 'typeorm';
import { Markup } from 'telegraf';
import { Viajes } from '../trips/entities/trip.entity';
import { Choferes } from './entities/driver.entity';
import { ServicesService } from '../services/services.service';
import { TelegramService } from '../telegram/telegram.service';

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
    @InjectRepository(Viajes)
    private readonly viajes: Repository<Viajes>,
    @InjectRepository(Choferes)
    private readonly choferes: Repository<Choferes>,
    // Se usa el servicio y no el bot crudo: ahi vive el limitador de ritmo
    // por el que tiene que pasar todo lo que sale hacia Telegram.
    @Inject(forwardRef(() => TelegramService))
    private readonly telegram: TelegramService,
    @Inject(forwardRef(() => ServicesService))
    private readonly servicesService: ServicesService,
  ) {}

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
