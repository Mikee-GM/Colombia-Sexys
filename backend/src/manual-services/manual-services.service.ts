import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SolicitudServicioManual } from './entities/manual-service-request.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { Usuarios } from '../users/entities/user.entity';
import { Clientes } from '../clients/entities/client.entity';
import { Servicios } from '../services/entities/service.entity';
import { RealtimeEventsService } from '../realtime/realtime.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AVISO_REGISTRO_APROBADO } from '../notifications/avisos-catalogo';
import { OfficeLiquidationSyncService } from '../liquidations/office-liquidation-sync.service';
import { CreateManualServiceRequestDto } from './dto/create-manual-service-request.dto';
import { describeError } from '../common/errors/error-message';
import { roundMoney } from '../common/money';
import { TransportOperationsService } from '../transport-operations/transport-operations.service';

/** Cuanto hacia atras se admite registrar un servicio ya ocurrido. */
const ANTIGUEDAD_MAXIMA_DIAS = 60;

/** Cuanto hacia delante se admite agendar uno que la empleada acaba de cuadrar. */
const ANTICIPACION_MAXIMA_DIAS = 7;
const ANTICIPACION_MAXIMA_MS = ANTICIPACION_MAXIMA_DIAS * 24 * 60 * 60 * 1000;

/**
 * Holgura hacia atras para un servicio inmediato.
 *
 * Quien pone "ahora mismo" y tarda en rellenar el resto del formulario manda
 * una hora ya vencida por unos minutos. Rechazarsela seria exigirle que adivine
 * cuanto va a tardar en escribir.
 */
const MARGEN_PASADO_INMEDIATO_MS = 30 * 60 * 1000;

@Injectable()
export class ManualServicesService {
  private readonly logger = new Logger(ManualServicesService.name);

  constructor(
    @InjectRepository(SolicitudServicioManual)
    private readonly solicitudes: Repository<SolicitudServicioManual>,
    @InjectRepository(Empleadas)
    private readonly empleadas: Repository<Empleadas>,
    @InjectRepository(Usuarios)
    private readonly usuarios: Repository<Usuarios>,
    @InjectRepository(Clientes)
    private readonly clientes: Repository<Clientes>,
    @InjectRepository(Servicios)
    private readonly servicios: Repository<Servicios>,
    private readonly realtime: RealtimeEventsService,
    private readonly notifications: NotificationsService,
    private readonly liquidationSync: OfficeLiquidationSyncService,
    private readonly transportOperations: TransportOperationsService,
  ) {}

  /**
   * Jefe que tiene que autorizar el registro.
   *
   * El principal si sigue activo, si no el secundario, y como ultimo recurso
   * cualquier jefe o admin activo: una solicitud sin destinatario no la ve
   * nadie y la empleada se queda esperando una respuesta que no llega.
   */
  private async jefeQueAutoriza(empleada: Empleadas): Promise<Usuarios> {
    const candidatos = [empleada.jefeId, empleada.jefeSecundarioId].filter(
      (id): id is string => Boolean(id),
    );
    for (const id of candidatos) {
      const jefe = await this.usuarios.findOne({ where: { id, activo: true } });
      if (jefe) return jefe;
    }
    const suplente = await this.usuarios.findOne({
      where: [
        { rol: 'jefe', activo: true },
        { rol: 'admin', activo: true },
      ],
    });
    if (!suplente) {
      throw new ConflictException(
        'No hay ningún jefe activo que pueda autorizar el registro',
      );
    }
    return suplente;
  }

  /**
   * Registra la solicitud de la empleada. Todavia no existe ningun servicio:
   * hasta que el jefe la apruebe esto es solo una peticion.
   */
  async crear(
    empleadaUserId: string,
    dto: CreateManualServiceRequestDto,
  ): Promise<SolicitudServicioManual> {
    const empleada = await this.empleadas.findOne({
      where: { usuarioId: empleadaUserId },
    });
    if (!empleada) {
      throw new ForbiddenException('No se encontró tu perfil de empleada');
    }

    const tipo = dto.tipo ?? 'pasado';
    const fechaServicio = new Date(dto.fechaServicio);
    if (Number.isNaN(fechaServicio.getTime())) {
      throw new BadRequestException('La fecha del servicio no es válida');
    }

    /*
     * Las dos direcciones del tiempo son excluyentes, y confundirlas es lo peor
     * que puede pasar aqui: un servicio "pasado" con fecha futura entraria al
     * corte por dinero que nadie ha cobrado, y uno "inmediato" fechado la
     * semana pasada mandaria a la empleada a una cita que ya no existe.
     */
    if (tipo === 'pasado') {
      if (fechaServicio.getTime() > Date.now()) {
        throw new BadRequestException(
          'No se puede registrar un servicio que todavía no ha ocurrido',
        );
      }
      const antiguedadDias =
        (Date.now() - fechaServicio.getTime()) / (24 * 60 * 60 * 1000);
      if (antiguedadDias > ANTIGUEDAD_MAXIMA_DIAS) {
        throw new BadRequestException(
          `Solo se pueden registrar servicios de los últimos ${ANTIGUEDAD_MAXIMA_DIAS} días`,
        );
      }
    } else {
      // Un margen corto hacia atras absorbe el reloj del telefono y el rato que
      // tarda en rellenar el formulario; hacia delante, la misma ventana de
      // agenda que admite el flujo de reservas.
      if (fechaServicio.getTime() < Date.now() - MARGEN_PASADO_INMEDIATO_MS) {
        throw new BadRequestException(
          'Para un servicio que aún no haces, la hora no puede estar en el pasado',
        );
      }
      if (fechaServicio.getTime() > Date.now() + ANTICIPACION_MAXIMA_MS) {
        throw new BadRequestException(
          `Solo se pueden agendar servicios dentro de los próximos ${ANTICIPACION_MAXIMA_DIAS} días`,
        );
      }
    }
    if (dto.duracionHoras <= 0 || dto.duracionHoras > 24) {
      throw new BadRequestException(
        'La duración debe estar entre 0 y 24 horas',
      );
    }
    if (dto.montoCobrado <= 0) {
      throw new BadRequestException('El monto cobrado debe ser mayor que cero');
    }
    if (dto.clienteId) {
      const cliente = await this.clientes.findOne({
        where: { id: dto.clienteId },
      });
      if (!cliente) throw new NotFoundException('Cliente no encontrado');
    }

    const jefe = await this.jefeQueAutoriza(empleada);
    const solicitud = await this.solicitudes.save(
      this.solicitudes.create({
        tipo,
        empleadaId: empleada.id,
        jefeId: jefe.id,
        clienteId: dto.clienteId ?? null,
        clienteNombreLibre: dto.clienteId
          ? null
          : dto.clienteNombreLibre?.trim() || null,
        fechaServicio,
        duracionHoras: dto.duracionHoras,
        metodoPago: dto.metodoPago,
        montoCobrado: roundMoney(dto.montoCobrado),
        ubicacion: dto.ubicacion?.trim() || null,
        motivo: dto.motivo.trim(),
        estado: 'pendiente',
      }),
    );

    this.realtime.emitToBoss(jefe.id, {
      type: 'manual_service_requested',
      data: { solicitudId: solicitud.id, empleadaId: empleada.id },
    });
    return this.buscarOFallar(solicitud.id);
  }

  /**
   * Lo que hace falta para que el formulario venga relleno.
   *
   * La empleada rellena esto desde el telefono, muchas veces con el cliente
   * delante: cada dato que tenga que teclear a mano es una via de que la
   * solicitud llegue al jefe incompleta o mal. Con su tarifa se calcula solo el
   * monto en cuanto elige las horas, y con los moteles habituales elige el
   * lugar de una lista en vez de escribirlo.
   */
  async opcionesParaEmpleada(empleadaUserId: string): Promise<{
    empleada: { id: string; nombreArtistico: string; precioBaseHora: number };
    ubicaciones: string[];
  }> {
    const empleada = await this.empleadas.findOne({
      where: { usuarioId: empleadaUserId },
    });
    if (!empleada) {
      throw new ForbiddenException('No se encontró tu perfil de empleada');
    }
    const ubicaciones = await this.transportOperations
      .activeLocations()
      .catch(() => []);
    return {
      empleada: {
        id: empleada.id,
        nombreArtistico: empleada.nombreArtistico,
        precioBaseHora: Number(empleada.precioBaseHora),
      },
      ubicaciones: ubicaciones.map((lugar) =>
        lugar.address ? `${lugar.name} (${lugar.address})` : lugar.name,
      ),
    };
  }

  async buscarOFallar(id: string): Promise<SolicitudServicioManual> {
    const solicitud = await this.solicitudes.findOne({
      where: { id },
      relations: { empleada: true, cliente: true, jefe: true },
    });
    if (!solicitud) throw new NotFoundException('Solicitud no encontrada');
    return solicitud;
  }

  /** Cada quien ve lo suyo: la empleada sus registros, el jefe los que autoriza. */
  async listar(
    actor: Usuarios,
    estado?: string,
  ): Promise<SolicitudServicioManual[]> {
    const query = this.solicitudes
      .createQueryBuilder('solicitud')
      .leftJoinAndSelect('solicitud.empleada', 'empleada')
      .leftJoinAndSelect('solicitud.cliente', 'cliente')
      .orderBy('solicitud.createdAt', 'DESC')
      .take(200);

    if (estado) query.andWhere('solicitud.estado = :estado', { estado });
    if (actor.rol === 'jefe') {
      query.andWhere(
        '(solicitud.jefeId = :actorId OR empleada.jefeId = :actorId OR empleada.jefeSecundarioId = :actorId)',
        { actorId: actor.id },
      );
    } else if (actor.rol === 'empleada') {
      query.andWhere('empleada.usuarioId = :actorId', { actorId: actor.id });
    }
    return query.getMany();
  }

  private assertPuedeResolver(
    solicitud: SolicitudServicioManual,
    actor: Usuarios,
  ): void {
    if (actor.rol === 'admin') return;
    if (actor.rol !== 'jefe') {
      throw new ForbiddenException('Solo un jefe puede autorizar el registro');
    }
    const suya =
      solicitud.jefeId === actor.id ||
      solicitud.empleada?.jefeId === actor.id ||
      solicitud.empleada?.jefeSecundarioId === actor.id;
    if (!suya) {
      throw new ForbiddenException('Esta solicitud no es tuya');
    }
  }

  /**
   * Aprueba el registro y crea el servicio.
   *
   * La transicion va condicionada dentro del propio UPDATE: dos toques en
   * "Aprobar" --o el jefe y el admin a la vez-- solo pueden crear un servicio.
   */
  async aprobar(
    id: string,
    actorUserId: string,
    nota?: string,
  ): Promise<SolicitudServicioManual> {
    const solicitud = await this.buscarOFallar(id);
    const actor = await this.usuarios.findOne({ where: { id: actorUserId } });
    if (!actor) throw new ForbiddenException('Usuario no autorizado');
    this.assertPuedeResolver(solicitud, actor);
    if (solicitud.estado !== 'pendiente') {
      throw new ConflictException('Esta solicitud ya fue resuelta');
    }

    const ganada = await this.solicitudes
      .createQueryBuilder()
      .update(SolicitudServicioManual)
      .set({
        estado: 'aprobada',
        resueltoPorUserId: actorUserId,
        resueltoAt: new Date(),
        notaResolucion: nota?.trim() || null,
      })
      .where('id = :id AND estado = :estado', { id, estado: 'pendiente' })
      .execute();
    if ((ganada.affected ?? 0) === 0) {
      throw new ConflictException('Esta solicitud ya fue resuelta');
    }

    const servicio = await this.crearServicioDesdeSolicitud(
      solicitud,
      actor.id,
    );
    await this.solicitudes.update(id, { servicioId: servicio.id });

    /*
     * Solo el que ya ocurrio entra al corte al aprobarse. El que todavia no se
     * hace nace en `pendiente` y liquidara cuando se cierre, por el mismo
     * camino que cualquier otro servicio: sincronizarlo aqui apuntaria un
     * ingreso que nadie ha cobrado.
     */
    if (solicitud.tipo !== 'inmediato') {
      await this.liquidationSync
        .syncOfficeRecord(servicio.id)
        .catch((error: unknown) =>
          this.logger.error(
            `El servicio manual ${servicio.id} se creó, pero no se pudo sincronizar su liquidación: ${describeError(error)}`,
          ),
        );
    }

    this.realtime.emitToJefes({
      type: 'manual_service_approved',
      data: { solicitudId: id, servicioId: servicio.id },
    });
    /*
     * Nivel 2: le confirma que ese servicio se le va a pagar. El evento en vivo
     * de debajo va a su canal de panel, que no sirve para avisar: la clave de
     * ese canal es el id de empleada, no el de su usuario.
     */
    if (solicitud.empleada?.usuarioId) {
      try {
        await this.notifications.notificar(solicitud.empleada.usuarioId, {
          titulo:
            solicitud.tipo === 'inmediato'
              ? 'Te autorizaron el servicio'
              : 'Aprobaron tu registro',
          cuerpo:
            solicitud.tipo === 'inmediato'
              ? 'El servicio que cuadraste ya está autorizado y te aparece en tu portal.'
              : 'El servicio que registraste a mano quedó aprobado.',
          url:
            solicitud.tipo === 'inmediato'
              ? '/empleada/servicio'
              : '/empleada/portal',
          tag: `registro-${id}`,
          tipo: AVISO_REGISTRO_APROBADO,
        });
      } catch (err) {
        this.logger.error(
          'Error enviando el aviso push del registro aprobado:',
          err,
        );
      }
    }

    this.realtime.emitToEmployee(solicitud.empleadaId, {
      type: 'manual_service_resolved',
      data: { solicitudId: id, estado: 'aprobada' },
    });
    return this.buscarOFallar(id);
  }

  async rechazar(
    id: string,
    actorUserId: string,
    nota: string,
  ): Promise<SolicitudServicioManual> {
    if (!nota?.trim()) {
      throw new BadRequestException(
        'Explica por qué no se registra: la empleada solo recibe eso',
      );
    }
    const solicitud = await this.buscarOFallar(id);
    const actor = await this.usuarios.findOne({ where: { id: actorUserId } });
    if (!actor) throw new ForbiddenException('Usuario no autorizado');
    this.assertPuedeResolver(solicitud, actor);

    const ganada = await this.solicitudes
      .createQueryBuilder()
      .update(SolicitudServicioManual)
      .set({
        estado: 'rechazada',
        resueltoPorUserId: actorUserId,
        resueltoAt: new Date(),
        notaResolucion: nota.trim(),
      })
      .where('id = :id AND estado = :estado', { id, estado: 'pendiente' })
      .execute();
    if ((ganada.affected ?? 0) === 0) {
      throw new ConflictException('Esta solicitud ya fue resuelta');
    }

    this.realtime.emitToEmployee(solicitud.empleadaId, {
      type: 'manual_service_resolved',
      data: { solicitudId: id, estado: 'rechazada' },
    });
    return this.buscarOFallar(id);
  }

  /**
   * El servicio que nace de una solicitud aprobada.
   *
   * Nace ya finalizado y con la liquidacion abierta, como si lo hubiera cerrado
   * la empleada: no hay viaje que cuadrar ni transporte que cobrar, pero el
   * dinero si tiene que entrar al corte.
   *
   * La tarifa por hora se deriva del monto que la empleada declara haber
   * cobrado, para que el total que calcula el trigger coincida exactamente con
   * lo que ella dijo en vez de con el precio de catalogo, que pudo no ser el
   * que se aplico.
   */
  private async crearServicioDesdeSolicitud(
    solicitud: SolicitudServicioManual,
    aprobadaPorUserId: string,
  ): Promise<Servicios> {
    const empleada =
      solicitud.empleada ??
      (await this.empleadas.findOneOrFail({
        where: { id: solicitud.empleadaId },
      }));

    const horas = Number(solicitud.duracionHoras);
    const fin = new Date(
      solicitud.fechaServicio.getTime() + horas * 60 * 60 * 1000,
    );
    const esInmediato = solicitud.tipo === 'inmediato';

    /*
     * Las coordenadas son obligatorias en `servicios` y aqui no hubo pin. Se
     * usa la ultima posicion conocida de la empleada, que es una aproximacion
     * real y trazable; poner ceros habria pintado el servicio en el Golfo de
     * Guinea en cualquier mapa que lo lea.
     */
    const lat = Number(empleada.ubicacionLat ?? 0);
    const lng = Number(empleada.ubicacionLng ?? 0);

    const servicio = await this.servicios.save(
      this.servicios.create({
        empleadaId: solicitud.empleadaId,
        clienteId: solicitud.clienteId,
        clienteNombreLibre: solicitud.clienteNombreLibre,
        jefeId: solicitud.jefeId,
        registroManual: true,
        metodoPago: solicitud.metodoPago,
        duracionPactadaHoras: horas,
        precioBaseHoraPactado: roundMoney(
          Number(solicitud.montoCobrado) / (horas || 1),
        ),
        ubicacionClienteLat: lat,
        ubicacionClienteLng: lng,
        customerTransportCharge: 0,
        totalTransporte: 0,
        iaActiva: false,
        /*
         * El que ya ocurrio nace cerrado y con la liquidacion abierta, como si
         * lo hubiera finalizado la empleada: no hay viaje que cuadrar, pero el
         * dinero tiene que entrar al corte.
         *
         * El que todavia no se hace nace igual que cualquier reserva --en
         * `pendiente`, con su hora estimada-- para que siga el camino normal:
         * transporte, inicio, cierre y cobro. Darlo por finalizado meteria en
         * el corte un dinero que aun no ha cobrado nadie.
         */
        ...(esInmediato
          ? {
              estado: 'pendiente' as const,
              horaInicioEstimada: solicitud.fechaServicio,
              tipoAgenda: 'programado' as const,
              fechaProgramada: solicitud.fechaServicio,
            }
          : {
              estado: 'finalizado' as const,
              duracionFinalHoras: horas,
              horaInicioServicio: solicitud.fechaServicio,
              horaFinServicio: fin,
              estadoLiquidacion: 'transporte_pendiente' as const,
            }),
        notas: [
          esInmediato
            ? '[Registro manual: la empleada cuadró este servicio por su cuenta]'
            : '[Registro manual: el servicio ocurrió fuera del sistema]',
          solicitud.ubicacion ? `Lugar: ${solicitud.ubicacion}` : null,
          solicitud.clienteNombreLibre
            ? `Cliente: ${solicitud.clienteNombreLibre}`
            : null,
          `${esInmediato ? 'Cómo lo consiguió' : 'Motivo'}: ${solicitud.motivo}`,
          `Autorizado por: ${aprobadaPorUserId}`,
        ]
          .filter(Boolean)
          .join('\n'),
      }),
    );

    // Se relee porque el total lo calcula un trigger de la base al insertar.
    return (
      (await this.servicios.findOne({ where: { id: servicio.id } })) ?? servicio
    );
  }
}
