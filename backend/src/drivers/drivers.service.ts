import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { Choferes } from './entities/driver.entity';
import { Usuarios } from '../users/entities/user.entity';
import { Viajes } from '../trips/entities/trip.entity';
import { APP_TIME_ZONE, APP_LOCALE } from '../common/locale';

export interface DriverPortalTripItem {
  id: string;
  fecha: string;
  tipo: 'ida' | 'regreso';
  zona: string;
  proveedorTransporte: string;
  driverPayout: number;
}

/**
 * Un viaje ofrecido que todavia espera respuesta.
 *
 * Aparte del viaje activo a proposito: aquel es el que ya acepto, y esto es lo
 * que aun puede aceptar o rechazar.
 */
export interface DriverPortalOffer {
  id: string;
  tipo: 'ida' | 'regreso';
  zona: string;
  proveedorTransporte: string;
  expiraEn: string | null;
}

export interface DriverPortalActiveTrip {
  id: string;
  tipo: 'ida' | 'regreso';
  estado: string;
  zona: string;
  proveedorTransporte: string;
}

export interface DriverPortalData {
  profile: {
    id: string;
    nombre: string;
    telefono: string;
    disponible: boolean;
    availabilityStatus: 'disponible' | 'inactiva';
    vehiculo: {
      marca: string | null;
      modelo: string | null;
      color: string | null;
      placa: string | null;
    };
  };
  ranking: {
    myPosition: number;
    totalDrivers: number;
    leaderboard: Array<{ position: number; nombre: string; isMe: boolean }>;
  };
  earnings: {
    todayNet: number;
    weekNet: number;
    monthNet: number;
    totalHistoricalNet: number;
    todayTrips: number;
    weekTrips: number;
    monthTrips: number;
    totalHistoricalTrips: number;
    weeklySettlementStatus: 'preview' | 'pending' | 'paid';
  };
  activeTrip: DriverPortalActiveTrip | null;
  /** Ofertas que esperan su respuesta; vacio si no hay ninguna viva. */
  pendingOffers: DriverPortalOffer[];
  recentTrips: DriverPortalTripItem[];
  reputation: {
    ratingAverage: number;
    ratingCount: number;
    kpiScore: number;
    confirmedReports90Days: number;
    reviews: Array<{
      id: string;
      fecha: string;
      estrellas: number;
      comentario: string;
    }>;
  };
}

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);

  constructor(
    @InjectRepository(Choferes)
    private readonly choferesRepository: Repository<Choferes>,
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    @InjectRepository(Viajes)
    private readonly viajesRepository: Repository<Viajes>,
    private readonly dataSource: DataSource,
  ) {}

  async create(createDriverDto: CreateDriverDto): Promise<Choferes> {
    const {
      email,
      password,
      telegramChatId,
      nombre,
      telefono,
      disponible,
      ubicacionLat,
      ubicacionLng,
      vehiculoMarca,
      vehiculoModelo,
      vehiculoColor,
      vehiculoPlaca,
    } = createDriverDto;

    // 1. Validar que el email no esté registrado
    const usuarioExistente = await this.usuariosRepository.findOne({
      where: { email },
    });
    if (usuarioExistente) {
      throw new ConflictException(
        `El correo electrónico ${email} ya está registrado`,
      );
    }

    // 2. Ejecutar transacción para creación atómica
    const result = await this.dataSource.transaction(async (manager) => {
      // A. Hashear la contraseña
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // B. Crear el usuario
      const nuevoUsuario = manager.create(Usuarios, {
        email,
        passwordHash,
        rol: 'chofer',
        telegramChatId: telegramChatId || null,
      });
      const usuarioGuardado = await manager.save(Usuarios, nuevoUsuario);

      // C. Crear el chofer vinculado
      const nuevoChofer = manager.create(Choferes, {
        usuarioId: usuarioGuardado.id,
        nombre,
        telefono,
        disponible: disponible ?? true,
        ubicacionLat: ubicacionLat ? Number(ubicacionLat) : null,
        ubicacionLng: ubicacionLng ? Number(ubicacionLng) : null,
        vehiculoMarca: vehiculoMarca || null,
        vehiculoModelo: vehiculoModelo || null,
        vehiculoColor: vehiculoColor || null,
        vehiculoPlaca: vehiculoPlaca || null,
      });
      const choferGuardado = await manager.save(Choferes, nuevoChofer);

      choferGuardado.usuario = usuarioGuardado;
      return choferGuardado;
    });

    // Omitir passwordHash de la respuesta
    if (result.usuario) {
      const { passwordHash: _, ...usuarioSinPassword } = result.usuario;
      result.usuario = usuarioSinPassword as Usuarios;
    }

    return result;
  }

  async findAll(): Promise<Choferes[]> {
    const drivers = await this.choferesRepository.find({
      relations: { usuario: true },
    });
    if (drivers.length === 0) return drivers;
    const ids = drivers.map((d) => d.id);
    const sanctionedRows: Array<{ subject_id: string }> =
      await this.dataSource.query(
        `SELECT DISTINCT subject_id
         FROM disciplinary_sanctions
         WHERE subject_type = 'driver'
           AND status = 'active'
           AND starts_at <= now()
           AND (type = 'permanent_ban' OR ends_at > now())
           AND subject_id = ANY($1::uuid[])`,
        [ids],
      );
    const sanctionedSet = new Set(sanctionedRows.map((r) => r.subject_id));
    return drivers.map((d) => {
      d.sancionada = sanctionedSet.has(d.id);
      return d;
    });
  }

  async findOne(id: string): Promise<Choferes> {
    const chofer = await this.choferesRepository.findOne({
      where: { id },
      relations: { usuario: true },
    });

    if (!chofer) {
      throw new NotFoundException(`Chofer con ID ${id} no encontrado`);
    }

    return chofer;
  }

  async update(
    id: string,
    updateDriverDto: UpdateDriverDto,
  ): Promise<Choferes> {
    await this.findOne(id);

    // Actualizar campos
    const updateData: any = { ...updateDriverDto };
    if (updateDriverDto.ubicacionLat !== undefined) {
      updateData.ubicacionLat =
        updateDriverDto.ubicacionLat !== null
          ? Number(updateDriverDto.ubicacionLat)
          : null;
    }
    if (updateDriverDto.ubicacionLng !== undefined) {
      updateData.ubicacionLng =
        updateDriverDto.ubicacionLng !== null
          ? Number(updateDriverDto.ubicacionLng)
          : null;
    }

    await this.choferesRepository.update(id, updateData);

    return await this.findOne(id);
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    await this.findOne(id);
    await this.choferesRepository.delete(id);
    return { deleted: true };
  }

  /**
   * Explica una lista vacia de choferes disponibles.
   *
   * El reparto exige seis condiciones a la vez y basta con que falle una para
   * que no salga nadie. Sin este desglose el sintoma es siempre el mismo -- "no
   * hay choferes disponibles" -- da igual si el problema es que nadie comparte
   * ubicacion, que todos cerraron su jornada o que quedaron marcados como
   * ocupados por viajes que nunca se cerraron.
   */
  private async logWhyNoDriversAvailable(): Promise<void> {
    try {
      const [conteo]: Array<Record<string, string>> =
        await this.dataSource.query(
          `SELECT
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE u.activo)::int AS activos,
             COUNT(*) FILTER (WHERE u.activo AND u.en_jornada)::int AS en_jornada,
             COUNT(*) FILTER (WHERE u.activo AND u.en_jornada AND c.disponible)::int AS disponibles,
             COUNT(*) FILTER (WHERE u.activo AND u.en_jornada AND c.disponible
                              AND u.telegram_chat_id IS NOT NULL)::int AS con_telegram,
             COUNT(*) FILTER (WHERE u.activo AND u.en_jornada AND c.disponible
                              AND u.telegram_chat_id IS NOT NULL
                              AND c.ubicacion_lat IS NOT NULL
                              AND c.ubicacion_lng IS NOT NULL)::int AS con_ubicacion
           FROM choferes c
           JOIN usuarios u ON u.id = c.usuario_id`,
        );

      this.logger.warn(
        'Sin choferes para el reparto. De ' +
          `${conteo.total} choferes: ${conteo.activos} con cuenta activa, ` +
          `${conteo.en_jornada} dentro de su jornada, ` +
          `${conteo.disponibles} no ocupados, ` +
          `${conteo.con_telegram} con Telegram vinculado, ` +
          `${conteo.con_ubicacion} con ubicacion registrada. ` +
          'El primer numero que cae a cero es la causa.',
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Sin choferes para el reparto y no se pudo diagnosticar por que: ${String(error)}`,
      );
    }
  }

  async findAvailableDriversOrderByDistance(
    lat: number,
    lng: number,
  ): Promise<{ chofer: Choferes; distancia: number }[]> {
    const result = await this.choferesRepository
      .createQueryBuilder('chofer')
      .innerJoinAndSelect('chofer.usuario', 'usuario')
      .where('chofer.disponible = :disponible', { disponible: true })
      .andWhere('usuario.activo = :usuarioActivo', { usuarioActivo: true })
      // Fuera de jornada no entra al reparto, aunque siga marcado disponible.
      .andWhere('usuario.enJornada = :enJornada', { enJornada: true })
      .andWhere('usuario.telegramChatId IS NOT NULL')
      .andWhere('chofer.ubicacionLat IS NOT NULL')
      .andWhere('chofer.ubicacionLng IS NOT NULL')
      .select([
        'chofer.id',
        'chofer.nombre',
        'chofer.telefono',
        'chofer.ubicacionLat',
        'chofer.ubicacionLng',
        'usuario.telegramChatId',
      ])
      .addSelect(
        'calcular_distancia_haversine(:lat, :lng, CAST(chofer.ubicacion_lat AS double precision), CAST(chofer.ubicacion_lng AS double precision))',
        'distancia',
      )
      .setParameter('lat', lat)
      .setParameter('lng', lng)
      .orderBy('distancia', 'ASC')
      .getRawAndEntities();

    if (result.entities.length === 0) {
      // Un "no hay choferes disponibles" a secas no dice nada: seis condiciones
      // tienen que cumplirse a la vez y cualquiera de ellas deja la lista
      // vacia. Se cuenta cuantos choferes falla cada una para poder arreglar la
      // que toca en vez de adivinar.
      await this.logWhyNoDriversAvailable();
    }

    return result.entities.map((entity, index) => {
      const raw = result.raw[index];
      return {
        chofer: entity,
        distancia: parseFloat(raw.distancia),
      };
    });
  }

  async getKpis(): Promise<
    Array<{
      id: string;
      nombre: string;
      fotoPerfilUrl: null;
      ratingAverage: number | null;
      confirmedReports90Days: number;
      revenue90Days: number;
      disponible: boolean;
      score: number | null;
      position: number | null;
    }>
  > {
    const drivers = await this.choferesRepository.find({
      select: { id: true, nombre: true, disponible: true },
    });
    if (drivers.length === 0) return [];
    const driverIds = drivers.map((d) => d.id);

    const ratingRows: Array<{ driver_id: string; average: number }> =
      await this.dataSource.query(
        `SELECT driver_id, AVG(stars)::float AS average
         FROM interaction_ratings
         WHERE direction = 'employee_to_driver' AND driver_id = ANY($1::uuid[])
         GROUP BY driver_id`,
        [driverIds],
      );
    const ratingByDriver = new Map(
      ratingRows.map((row) => [row.driver_id, Number(row.average)]),
    );

    const reportRows: Array<{ subject_id: string; confirmed: number }> =
      await this.dataSource.query(
        `SELECT subject_id, COUNT(*)::int AS confirmed
         FROM conduct_reports
         WHERE subject_type = 'driver' AND outcome = 'confirmado'
           AND created_at >= now() - interval '90 days'
           AND subject_id = ANY($1::uuid[])
         GROUP BY subject_id`,
        [driverIds],
      );
    const reportsByDriver = new Map(
      reportRows.map((row) => [row.subject_id, Number(row.confirmed)]),
    );

    const revenueRows: Array<{ chofer_id: string; revenue: string }> =
      await this.dataSource.query(
        `SELECT chofer_id, COALESCE(SUM(driver_payout), 0) AS revenue
         FROM viajes
         WHERE estado = 'finalizado' AND proveedor_transporte = 'interno'
           AND hora_fin_viaje >= now() - interval '90 days'
           AND chofer_id = ANY($1::uuid[])
         GROUP BY chofer_id`,
        [driverIds],
      );
    const revenueByDriver = new Map(
      revenueRows.map((row) => [row.chofer_id, Number(row.revenue)]),
    );
    const maxRevenue = Math.max(0, ...revenueByDriver.values());

    const kpis = drivers.map((driver) => {
      const ratingAverage = ratingByDriver.get(driver.id) ?? null;
      const confirmedReports90Days = reportsByDriver.get(driver.id) ?? 0;
      const revenue90Days = revenueByDriver.get(driver.id) ?? 0;
      // Mismo criterio que en employees.service.ts: bono acotado por ingresos relativos
      // a la mejor de sus pares en 90 días, más un bono fijo si está disponible ahora.
      let score: number | null = null;
      if (ratingAverage != null) {
        const revenueBonus =
          maxRevenue > 0 ? Math.round((revenue90Days / maxRevenue) * 10) : 0;
        const availabilityBonus = driver.disponible ? 5 : 0;
        score = Math.max(
          0,
          Math.round((ratingAverage / 5) * 100 - confirmedReports90Days * 8) +
            revenueBonus +
            availabilityBonus,
        );
      }
      return {
        id: driver.id,
        nombre: driver.nombre,
        fotoPerfilUrl: null,
        ratingAverage,
        confirmedReports90Days,
        revenue90Days,
        disponible: driver.disponible,
        score,
        position: null as number | null,
      };
    });

    kpis.sort((a, b) => {
      if (a.score == null && b.score == null) return 0;
      if (a.score == null) return 1;
      if (b.score == null) return -1;
      return b.score - a.score;
    });
    let position = 0;
    for (const kpi of kpis) {
      if (kpi.score != null) {
        position += 1;
        kpi.position = position;
      }
    }
    return kpis;
  }

  async getDriverPortalData(identifier: string): Promise<DriverPortalData> {
    const chofer = await this.choferesRepository.findOne({
      where: [{ usuarioId: identifier }, { id: identifier }],
      relations: { usuario: true },
    });
    if (!chofer) {
      throw new NotFoundException('Perfil de chofer no encontrado');
    }

    const [ratingRow] = await this.dataSource.query(
      `SELECT ROUND(AVG(stars)::numeric, 2)::float AS average, COUNT(*)::int AS count
       FROM interaction_ratings
       WHERE driver_id = $1 AND direction = 'employee_to_driver'`,
      [chofer.id],
    );
    const ratingAverage = Number(ratingRow?.average) || 0;
    const ratingCount = Number(ratingRow?.count) || 0;

    const [confirmedRow] = await this.dataSource.query(
      `SELECT COUNT(*)::int AS count
       FROM conduct_reports
       WHERE subject_type = 'driver' AND subject_id = $1
         AND outcome = 'confirmado' AND created_at >= now() - interval '90 days'`,
      [chofer.id],
    );
    const confirmedReports90Days = Number(confirmedRow?.count) || 0;
    const kpiScore =
      ratingCount > 0
        ? Math.max(
            0,
            Math.round((ratingAverage / 5) * 100 - confirmedReports90Days * 8),
          )
        : 0;

    const reviewRows: Array<{
      stars: number;
      comment: string;
      createdAt: string;
    }> = await this.dataSource.query(
      `SELECT stars, comment, created_at AS "createdAt"
       FROM interaction_ratings
       WHERE driver_id = $1 AND direction = 'employee_to_driver' AND comment IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 15`,
      [chofer.id],
    );

    // Ranking entre choferes activos, ponderado igual que el KPI de modelos
    const allDrivers = await this.choferesRepository.find({
      where: {},
      relations: { usuario: true },
    });
    const activeDrivers = allDrivers.filter((d) => d.usuario?.activo);
    const driverIds = activeDrivers.map((d) => d.id);
    const scoreRows: Array<{ driver_id: string; score: number }> =
      driverIds.length === 0
        ? []
        : await this.dataSource.query(
            `SELECT c.id AS driver_id,
              GREATEST(0, ROUND(
                (COALESCE(r.average, 0) / 5) * 100
                - COALESCE(rep.confirmed, 0) * 8
              ))::int AS score
             FROM choferes c
             LEFT JOIN (
               SELECT driver_id, AVG(stars) AS average
               FROM interaction_ratings
               WHERE direction = 'employee_to_driver'
               GROUP BY driver_id
             ) r ON r.driver_id = c.id
             LEFT JOIN (
               SELECT subject_id, COUNT(*) AS confirmed
               FROM conduct_reports
               WHERE subject_type = 'driver' AND outcome = 'confirmado'
                 AND created_at >= now() - interval '90 days'
               GROUP BY subject_id
             ) rep ON rep.subject_id = c.id
             WHERE c.id = ANY($1::uuid[])`,
            [driverIds],
          );
    const scoreByDriver = new Map(
      scoreRows.map((row) => [row.driver_id, Number(row.score) || 0]),
    );
    const ranked = activeDrivers
      .map((d) => ({
        id: d.id,
        nombre: d.nombre,
        score: scoreByDriver.get(d.id) || 0,
      }))
      .sort((a, b) => b.score - a.score);
    let myPosition = 1;
    const leaderboard = ranked.map((item, index) => {
      const isMe = item.id === chofer.id;
      if (isMe) myPosition = index + 1;
      return { position: index + 1, nombre: item.nombre, isMe };
    });

    // Viajes internos finalizados: ganancias y viajes recientes
    const trips = await this.viajesRepository.find({
      where: { choferId: chofer.id, proveedorTransporte: 'interno' },
      order: { horaFinViaje: 'DESC' },
    });
    const finishedTrips = trips.filter(
      (t) => t.estado === 'finalizado' && t.horaFinViaje,
    );
    const now = new Date();
    const isSameDay = (d1: Date, d2: Date) =>
      d1.toLocaleDateString(APP_LOCALE, { timeZone: APP_TIME_ZONE }) ===
      d2.toLocaleDateString(APP_LOCALE, { timeZone: APP_TIME_ZONE });
    const isSameMonth = (d1: Date, d2: Date) => {
      const fmt = (d: Date) =>
        new Intl.DateTimeFormat(APP_LOCALE, {
          timeZone: APP_TIME_ZONE,
          year: 'numeric',
          month: 'numeric',
        }).format(d);
      return fmt(d1) === fmt(d2);
    };
    const isSameWeek = (d1: Date, d2: Date) =>
      Math.ceil(
        Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24),
      ) <= 7;

    let todayNet = 0;
    let weekNet = 0;
    let monthNet = 0;
    let totalHistoricalNet = 0;
    let todayTrips = 0;
    let weekTrips = 0;
    let monthTrips = 0;
    const totalHistoricalTrips = finishedTrips.length;

    for (const trip of finishedTrips) {
      const payout = Number(trip.driverPayout) || 0;
      totalHistoricalNet += payout;
      const d = new Date(trip.horaFinViaje as Date);
      if (isSameDay(d, now)) {
        todayNet += payout;
        todayTrips += 1;
      }
      if (isSameWeek(d, now)) {
        weekNet += payout;
        weekTrips += 1;
      }
      if (isSameMonth(d, now)) {
        monthNet += payout;
        monthTrips += 1;
      }
    }

    const recentTrips: DriverPortalTripItem[] = finishedTrips
      .slice(0, 20)
      .map((trip) => ({
        id: trip.id,
        fecha: (trip.horaFinViaje as Date).toISOString(),
        tipo: trip.tipo,
        zona: trip.zona,
        proveedorTransporte: trip.proveedorTransporte,
        driverPayout: Number(trip.driverPayout) || 0,
      }));

    const activeTripEntity = trips.find((t) =>
      ['aceptado', 'en_camino', 'en_curso', 'llegado'].includes(t.estado),
    );
    const activeTrip: DriverPortalActiveTrip | null = activeTripEntity
      ? {
          id: activeTripEntity.id,
          tipo: activeTripEntity.tipo,
          estado: activeTripEntity.estado,
          zona: activeTripEntity.zona,
          proveedorTransporte: activeTripEntity.proveedorTransporte,
        }
      : null;

    /*
     * Las ofertas que todavia puede tomar.
     *
     * `notificado` es el estado en el que el reparto deja un viaje mientras
     * espera respuesta. No llegaban al portal, asi que aceptar dependia por
     * completo de ver el mensaje del bot a tiempo: si no lo veia, el viaje se
     * quedaba sin chofer. Se descartan las ya vencidas, que el barrido
     * periodico retira poco despues.
     */
    const pendingOffers = trips
      .filter(
        (t) =>
          t.estado === 'notificado' &&
          (!t.ofertaExpiraEn || t.ofertaExpiraEn.getTime() > now.getTime()),
      )
      .map((t) => ({
        id: t.id,
        tipo: t.tipo,
        zona: t.zona,
        proveedorTransporte: t.proveedorTransporte,
        expiraEn: t.ofertaExpiraEn ? t.ofertaExpiraEn.toISOString() : null,
      }));

    const weekBounds = (() => {
      const d = new Date(now);
      const day = d.getDay();
      const adjustedDay = day === 0 ? 7 : day;
      d.setDate(d.getDate() - adjustedDay + 1);
      d.setHours(0, 0, 0, 0);
      return d.toISOString().slice(0, 10);
    })();
    const settlement = await this.dataSource.query(
      `SELECT status FROM driver_settlements WHERE driver_id = $1 AND week_start = $2`,
      [chofer.id, weekBounds],
    );
    const weeklySettlementStatus: 'preview' | 'pending' | 'paid' =
      settlement[0]?.status || 'preview';

    return {
      profile: {
        id: chofer.id,
        nombre: chofer.nombre,
        telefono: chofer.telefono,
        disponible: chofer.disponible,
        availabilityStatus: chofer.disponible ? 'disponible' : 'inactiva',
        vehiculo: {
          marca: chofer.vehiculoMarca,
          modelo: chofer.vehiculoModelo,
          color: chofer.vehiculoColor,
          placa: chofer.vehiculoPlaca,
        },
      },
      ranking: {
        myPosition,
        totalDrivers: leaderboard.length,
        leaderboard,
      },
      earnings: {
        todayNet: Math.round(todayNet * 100) / 100,
        weekNet: Math.round(weekNet * 100) / 100,
        monthNet: Math.round(monthNet * 100) / 100,
        totalHistoricalNet: Math.round(totalHistoricalNet * 100) / 100,
        todayTrips,
        weekTrips,
        monthTrips,
        totalHistoricalTrips,
        weeklySettlementStatus,
      },
      activeTrip,
      pendingOffers,
      recentTrips,
      reputation: {
        ratingAverage,
        ratingCount,
        kpiScore,
        confirmedReports90Days,
        reviews: reviewRows.map((row) => ({
          id: `${row.createdAt}`,
          fecha: row.createdAt,
          estrellas: row.stars,
          comentario: row.comment,
        })),
      },
    };
  }
}
