import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Clientes } from './entities/client.entity';
import { DisciplineService } from '../discipline/discipline.service';
import { APP_TIME_ZONE } from '../common/locale';

/** Lo que devuelve cada consulta agregada, para no perder el tipo. */
interface FilaResumen {
  serviciosTotales: number;
  finalizados: number;
  cancelados: number;
  enCurso: number;
  gastoTotal: number;
  ticketPromedio: number;
  horasTotales: number;
  primerServicioAt: Date | null;
  ultimoServicioAt: Date | null;
}

interface FilaCalificaciones {
  queDio: number | null;
  queRecibio: number | null;
}

interface FilaMes {
  mes: string;
  servicios: number;
  gasto: number;
}

interface FilaLealtad {
  puntos: number | null;
  nivel: string | null;
}

/** Cuantos meses de historia se pintan en las graficas. */
const MESES_DE_SERIE = 12;

/** Tope de filas en los listados de detalle de la ficha. */
const TOPE_DETALLE = 20;

export interface ClientDossier {
  cliente: {
    id: string;
    nombreTelegram: string | null;
    telegramChatId: string;
    primerContactoAt: Date;
    createdAt: Date;
    diasDesdePrimerContacto: number;
  };
  bloqueo: {
    bloqueado: boolean;
    tipo: string | null;
    motivo: string | null;
    desde: Date | null;
    hasta: Date | null;
  };
  resumen: {
    serviciosTotales: number;
    finalizados: number;
    cancelados: number;
    enCurso: number;
    gastoTotal: number;
    ticketPromedio: number;
    horasTotales: number;
    primerServicioAt: Date | null;
    ultimoServicioAt: Date | null;
    diasDesdeUltimoServicio: number | null;
    calificacionPromedioQueDio: number | null;
    calificacionPromedioQueRecibio: number | null;
  };
  porMes: Array<{ mes: string; servicios: number; gasto: number }>;
  porMetodoPago: Array<{ metodo: string; servicios: number; gasto: number }>;
  porEmpleada: Array<{
    empleadaId: string;
    nombre: string;
    servicios: number;
    gasto: number;
  }>;
  lealtad: {
    puntos: number;
    nivel: string | null;
  } | null;
  servicios: Array<{
    id: string;
    fecha: Date | null;
    estado: string;
    empleada: string | null;
    total: number;
    metodoPago: string;
    calificacion: number | null;
    registroManual: boolean;
  }>;
  reportesRecibidos: Array<{
    id: string;
    categoria: string;
    descripcion: string;
    estado: string;
    outcome: string | null;
    createdAt: Date;
  }>;
  sanciones: Array<{
    id: string;
    tipo: string;
    motivo: string;
    estado: string;
    startsAt: Date;
    endsAt: Date | null;
  }>;
  alertas: Array<{
    id: string;
    emocion: string;
    score: number | null;
    mensaje: string;
    atendida: boolean;
    createdAt: Date;
  }>;
}

/**
 * Todo lo que sabemos de un cliente, en una sola respuesta.
 *
 * Vive aparte de `ClientsService` porque no es un CRUD: son ocho consultas de
 * agregacion contra tablas distintas, y mezclarlas con el alta y la baja de
 * clientes habria dejado un servicio que hace dos cosas sin relacion.
 *
 * Cada bloque es una consulta agregada en Postgres, no un `find` que se
 * recorre en memoria: un cliente veterano tiene cientos de servicios y miles de
 * mensajes, y la ficha se abre para mirarla, no para esperarla.
 */
@Injectable()
export class ClientDossierService {
  constructor(
    @InjectRepository(Clientes)
    private readonly clientes: Repository<Clientes>,
    private readonly dataSource: DataSource,
    private readonly discipline: DisciplineService,
  ) {}

  async build(clienteId: string): Promise<ClientDossier> {
    const cliente = await this.clientes.findOne({ where: { id: clienteId } });
    if (!cliente) throw new NotFoundException('Cliente no encontrado');

    const [
      bloqueo,
      resumen,
      porMes,
      porMetodoPago,
      porEmpleada,
      lealtad,
      servicios,
      reportesRecibidos,
      sanciones,
      alertas,
    ] = await Promise.all([
      this.bloqueo(clienteId),
      this.resumen(clienteId),
      this.porMes(clienteId),
      this.porMetodoPago(clienteId),
      this.porEmpleada(clienteId),
      this.lealtad(clienteId),
      this.ultimosServicios(clienteId),
      this.reportesRecibidos(clienteId),
      this.sanciones(clienteId),
      this.alertas(clienteId),
    ]);

    const diasDesde = (fecha: Date | null): number | null =>
      fecha === null
        ? null
        : Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000);

    return {
      cliente: {
        id: cliente.id,
        nombreTelegram: cliente.nombreTelegram,
        telegramChatId: cliente.telegramChatId,
        primerContactoAt: cliente.primerContactoAt,
        createdAt: cliente.createdAt,
        diasDesdePrimerContacto: diasDesde(cliente.primerContactoAt) ?? 0,
      },
      bloqueo,
      resumen: {
        ...resumen,
        diasDesdeUltimoServicio: diasDesde(resumen.ultimoServicioAt),
      },
      porMes,
      porMetodoPago,
      porEmpleada,
      lealtad,
      servicios,
      reportesRecibidos,
      sanciones,
      alertas,
    };
  }

  private async bloqueo(clienteId: string): Promise<ClientDossier['bloqueo']> {
    const sancion = await this.discipline.getActiveSanction(
      'client',
      clienteId,
    );
    return {
      bloqueado: Boolean(sancion),
      tipo: sancion?.type ?? null,
      motivo: sancion?.reason ?? null,
      desde: sancion?.startsAt ?? null,
      hasta: sancion?.endsAt ?? null,
    };
  }

  /**
   * El bloque de cabecera. `total_final` solo cuenta en los finalizados: un
   * servicio cancelado no es dinero que este cliente haya dejado.
   */
  private async resumen(
    clienteId: string,
  ): Promise<Omit<ClientDossier['resumen'], 'diasDesdeUltimoServicio'>> {
    const filas: FilaResumen[] = await this.dataSource.query(
      `SELECT
         COUNT(*)::int AS "serviciosTotales",
         COUNT(*) FILTER (WHERE estado = 'finalizado')::int AS "finalizados",
         COUNT(*) FILTER (WHERE estado = 'cancelado')::int AS "cancelados",
         COUNT(*) FILTER (WHERE estado IN ('pendiente','agendado','en_curso'))::int AS "enCurso",
         COALESCE(SUM(total_final) FILTER (WHERE estado = 'finalizado'), 0)::float AS "gastoTotal",
         COALESCE(AVG(total_final) FILTER (WHERE estado = 'finalizado'), 0)::float AS "ticketPromedio",
         COALESCE(SUM(COALESCE(duracion_final_horas, duracion_pactada_horas)) FILTER (WHERE estado = 'finalizado'), 0)::float AS "horasTotales",
         MIN(created_at) AS "primerServicioAt",
         MAX(created_at) AS "ultimoServicioAt"
       FROM servicios
       WHERE cliente_id = $1`,
      [clienteId],
    );
    const fila = filas[0];

    const calificaciones: FilaCalificaciones[] = await this.dataSource.query(
      `SELECT
         AVG(stars) FILTER (WHERE direction = 'client_to_employee')::float AS "queDio",
         AVG(stars) FILTER (WHERE direction = 'employee_to_client')::float AS "queRecibio"
       FROM interaction_ratings
       WHERE client_id = $1`,
      [clienteId],
    );

    return {
      serviciosTotales: fila.serviciosTotales,
      finalizados: fila.finalizados,
      cancelados: fila.cancelados,
      enCurso: fila.enCurso,
      gastoTotal: Number(fila.gastoTotal.toFixed(2)),
      ticketPromedio: Number(fila.ticketPromedio.toFixed(2)),
      horasTotales: Number(fila.horasTotales.toFixed(2)),
      primerServicioAt: fila.primerServicioAt,
      ultimoServicioAt: fila.ultimoServicioAt,
      calificacionPromedioQueDio: calificaciones[0]?.queDio ?? null,
      calificacionPromedioQueRecibio: calificaciones[0]?.queRecibio ?? null,
    };
  }

  /**
   * Serie mensual para la grafica. Se generan los meses vacios tambien: una
   * linea que salta de enero a junio miente sobre lo que paso en medio.
   */
  private async porMes(clienteId: string): Promise<ClientDossier['porMes']> {
    const filas: FilaMes[] = await this.dataSource.query(
      `SELECT
         to_char(date_trunc('month', created_at AT TIME ZONE $2), 'YYYY-MM') AS mes,
         COUNT(*)::int AS servicios,
         COALESCE(SUM(total_final) FILTER (WHERE estado = 'finalizado'), 0)::float AS gasto
       FROM servicios
       WHERE cliente_id = $1
         AND created_at >= date_trunc('month', now()) - make_interval(months => $3)
       GROUP BY 1
       ORDER BY 1`,
      [clienteId, APP_TIME_ZONE, MESES_DE_SERIE - 1],
    );

    const porMes = new Map(filas.map((fila) => [fila.mes, fila]));
    const serie: ClientDossier['porMes'] = [];
    const cursor = new Date();
    cursor.setDate(1);
    cursor.setMonth(cursor.getMonth() - (MESES_DE_SERIE - 1));
    for (let i = 0; i < MESES_DE_SERIE; i++) {
      const clave = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`;
      const fila = porMes.get(clave);
      serie.push({
        mes: clave,
        servicios: fila?.servicios ?? 0,
        gasto: Number((fila?.gasto ?? 0).toFixed(2)),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return serie;
  }

  private async porMetodoPago(
    clienteId: string,
  ): Promise<ClientDossier['porMetodoPago']> {
    return await this.dataSource.query(
      `SELECT
         metodo_pago AS metodo,
         COUNT(*)::int AS servicios,
         COALESCE(SUM(total_final) FILTER (WHERE estado = 'finalizado'), 0)::float AS gasto
       FROM servicios
       WHERE cliente_id = $1
       GROUP BY 1
       ORDER BY servicios DESC`,
      [clienteId],
    );
  }

  private async porEmpleada(
    clienteId: string,
  ): Promise<ClientDossier['porEmpleada']> {
    return await this.dataSource.query(
      `SELECT
         e.id AS "empleadaId",
         e.nombre_artistico AS nombre,
         COUNT(*)::int AS servicios,
         COALESCE(SUM(s.total_final) FILTER (WHERE s.estado = 'finalizado'), 0)::float AS gasto
       FROM servicios s
       JOIN empleadas e ON e.id = s.empleada_id
       WHERE s.cliente_id = $1
       GROUP BY e.id, e.nombre_artistico
       ORDER BY servicios DESC
       LIMIT 10`,
      [clienteId],
    );
  }

  private async lealtad(clienteId: string): Promise<ClientDossier['lealtad']> {
    const filas: FilaLealtad[] = await this.dataSource.query(
      `SELECT m.points_balance::float AS puntos, t.name AS nivel
         FROM client_memberships m
         LEFT JOIN loyalty_tiers t ON t.id = m.tier_id
        WHERE m.cliente_id = $1
        LIMIT 1`,
      [clienteId],
    );
    const fila = filas[0];
    return fila ? { puntos: fila.puntos ?? 0, nivel: fila.nivel } : null;
  }

  private async ultimosServicios(
    clienteId: string,
  ): Promise<ClientDossier['servicios']> {
    return await this.dataSource.query(
      `SELECT
         s.id,
         COALESCE(s.hora_inicio_servicio, s.fecha_programada, s.created_at) AS fecha,
         s.estado,
         e.nombre_artistico AS empleada,
         s.total_final::float AS total,
         s.metodo_pago AS "metodoPago",
         s.calificacion,
         s.registro_manual AS "registroManual"
       FROM servicios s
       LEFT JOIN empleadas e ON e.id = s.empleada_id
       WHERE s.cliente_id = $1
       ORDER BY fecha DESC
       LIMIT $2`,
      [clienteId, TOPE_DETALLE],
    );
  }

  /** Lo que las empleadas han reportado de el, que es lo que sostiene un veto. */
  private async reportesRecibidos(
    clienteId: string,
  ): Promise<ClientDossier['reportesRecibidos']> {
    return await this.dataSource.query(
      `SELECT id, category AS categoria, description AS descripcion,
              status AS estado, outcome, created_at AS "createdAt"
         FROM conduct_reports
        WHERE subject_type = 'client' AND subject_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [clienteId, TOPE_DETALLE],
    );
  }

  private async sanciones(
    clienteId: string,
  ): Promise<ClientDossier['sanciones']> {
    return await this.dataSource.query(
      `SELECT id, type AS tipo, reason AS motivo, status AS estado,
              starts_at AS "startsAt", ends_at AS "endsAt"
         FROM disciplinary_sanctions
        WHERE subject_type = 'client' AND subject_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [clienteId, TOPE_DETALLE],
    );
  }

  private async alertas(clienteId: string): Promise<ClientDossier['alertas']> {
    return await this.dataSource.query(
      `SELECT id, emocion_detectada AS emocion, score_sentimiento::float AS score,
              mensaje_original AS mensaje, atendida, created_at AS "createdAt"
         FROM alertas_clientes
        WHERE cliente_id = $1
        ORDER BY created_at DESC
        LIMIT $2`,
      [clienteId, TOPE_DETALLE],
    );
  }
}
