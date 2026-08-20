import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class GodEyeService {
  constructor(private readonly dataSource: DataSource) {}

  async getOverview() {
    const [
      activeServicesRow,
      employeesRow,
      driversRow,
      pendingReceiptsRow,
      recentNegativeRatingsRow,
      cashInStreetRow,
      activeSanctionsRow,
      pendingAppealsRow,
    ] = await Promise.all([
      this.dataSource.query(`
        SELECT COUNT(*)::int AS count
        FROM servicios
        WHERE estado IN ('pendiente', 'en_curso')
      `),
      this.dataSource.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE disponible = true)::int AS disponibles,
          COUNT(*) FILTER (WHERE disponible = false)::int AS ocupadas
        FROM empleadas
      `),
      this.dataSource.query(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE estado IN ('disponible', 'ocupado', 'en_viaje'))::int AS activos
        FROM choferes
      `),
      this.dataSource.query(`
        SELECT COUNT(*)::int AS count
        FROM payment_receipt_validations
        WHERE status = 'pending'
      `),
      this.dataSource.query(`
        SELECT COUNT(*)::int AS count
        FROM interaction_ratings
        WHERE stars <= 2
          AND created_at >= NOW() - INTERVAL '24 hours'
      `),
      this.dataSource.query(`
        SELECT COALESCE(SUM(monto_adeudo_restante), 0)::numeric AS total_cash
        FROM employee_cash_obligations
        WHERE status IN ('pending', 'partial')
      `),
      this.dataSource.query(`
        SELECT COUNT(*)::int AS count
        FROM disciplinary_sanctions
        WHERE status = 'active'
      `),
      this.dataSource.query(`
        SELECT COUNT(*)::int AS count
        FROM interaction_ratings
        WHERE appeal_status = 'pending'
      `),
    ]);

    const activeServicesList = await this.dataSource.query(`
      SELECT
        s.id,
        s.service_type AS "serviceType",
        s.estado,
        s.metodo_pago AS "metodoPago",
        s.duracion_pactada_horas AS "duracionPactadaHoras",
        s.precio_base_hora_pactado AS "precioBaseHoraPactado",
        s.total_final AS "totalFinal",
        s.ia_activa AS "iaActiva",
        s.hora_inicio_servicio AS "horaInicioServicio",
        s.created_at AS "createdAt",
        s.notas,
        c.id AS "clienteId",
        c.nombre_telegram AS "clienteNombre",
        e.id AS "empleadaId",
        e.nombre_artistico AS "empleadaNombre",
        e.foto_perfil_url AS "empleadaFoto",
        u.id AS "jefeId",
        u.email AS "jefeEmail"
      FROM servicios s
      LEFT JOIN clientes c ON c.id = s.cliente_id
      LEFT JOIN empleadas e ON e.id = s.empleada_id
      LEFT JOIN usuarios u ON u.id = s.jefe_id
      WHERE s.estado IN ('pendiente', 'en_curso')
      ORDER BY s.created_at DESC
      LIMIT 20
    `);

    return {
      metrics: {
        activeServices: activeServicesRow[0]?.count || 0,
        employeesTotal: employeesRow[0]?.total || 0,
        employeesAvailable: employeesRow[0]?.disponibles || 0,
        employeesBusy: employeesRow[0]?.ocupadas || 0,
        driversTotal: driversRow[0]?.total || 0,
        driversActive: driversRow[0]?.activos || 0,
        pendingReceipts: pendingReceiptsRow[0]?.count || 0,
        recentNegativeRatings: recentNegativeRatingsRow[0]?.count || 0,
        cashInStreet: Number(cashInStreetRow[0]?.total_cash || 0),
        activeSanctions: activeSanctionsRow[0]?.count || 0,
        pendingAppeals: pendingAppealsRow[0]?.count || 0,
      },
      activeServices: activeServicesList,
    };
  }

  async getActorDossier(type: 'employee' | 'driver' | 'boss', id: string) {
    if (type === 'employee') {
      const employeeRows = await this.dataSource.query(
        `SELECT
          e.id,
          e.nombre_artistico AS "nombreArtistico",
          e.nombre_real AS "nombreReal",
          e.slug_catalogo AS "slugCatalogo",
          e.foto_perfil_url AS "fotoPerfilUrl",
          e.descripcion,
          e.precio_base_hora AS "precioBaseHora",
          e.disponible,
          e.catalogo_activo AS "catalogoActivo",
          e.created_at AS "createdAt",
          e.jefe_id AS "jefeId",
          e.jefe_secundario_id AS "jefeSecundarioId",
          u.email AS "jefeEmail",
          u.telegram_chat_id AS "jefeTelegram",
          usr.telegram_chat_id AS "telegramChatId",
          usr.activo AS "usuarioActivo"
        FROM empleadas e
        LEFT JOIN usuarios u ON u.id = e.jefe_id
        LEFT JOIN usuarios usr ON usr.id = e.usuario_id
        WHERE e.id = $1`,
        [id],
      );
      const employee = employeeRows[0];
      if (!employee) throw new NotFoundException('Empleada no encontrada');

      const [ratings, reports, sanctions, servicesHistory, extras, cashObligations] =
        await Promise.all([
          this.dataSource.query(
            `SELECT
              r.id,
              r.direction,
              r.stars,
              r.comment,
              r.appeal_status AS "appealStatus",
              r.created_at AS "createdAt",
              c.nombre_telegram AS "clienteNombre",
              d.nombre AS "choferNombre"
            FROM interaction_ratings r
            LEFT JOIN clientes c ON c.id = r.client_id
            LEFT JOIN choferes d ON d.id = r.driver_id
            WHERE r.employee_id = $1
            ORDER BY r.created_at DESC
            LIMIT 15`,
            [id],
          ),
          this.dataSource.query(
            `SELECT
              id,
              direction,
              reporter_type AS "reporterType",
              category,
              description,
              priority,
              status,
              outcome,
              resolution,
              created_at AS "createdAt"
            FROM conduct_reports
            WHERE subject_type = 'employee' AND subject_id = $1
            ORDER BY created_at DESC
            LIMIT 10`,
            [id],
          ),
          this.dataSource.query(
            `SELECT
              id,
              type,
              status,
              reason,
              starts_at AS "startsAt",
              ends_at AS "endsAt",
              revocation_reason AS "revocationReason",
              created_at AS "createdAt"
            FROM disciplinary_sanctions
            WHERE subject_type = 'employee' AND subject_id = $1
            ORDER BY created_at DESC`,
            [id],
          ),
          this.dataSource.query(
            `SELECT
              s.id,
              s.estado,
              s.metodo_pago AS "metodoPago",
              s.duracion_pactada_horas AS "duracionPactadaHoras",
              s.total_final AS "totalFinal",
              s.created_at AS "createdAt",
              c.nombre_telegram AS "clienteNombre"
            FROM servicios s
            LEFT JOIN clientes c ON c.id = s.cliente_id
            WHERE s.empleada_id = $1
            ORDER BY s.created_at DESC
            LIMIT 10`,
            [id],
          ),
          this.dataSource.query(
            `SELECT id, nombre, precio, activo
             FROM extras_catalogo
             WHERE empleada_id = $1
             ORDER BY precio DESC`,
            [id],
          ),
          this.dataSource.query(
            `SELECT
              id,
              monto_adeudo_original AS "montoOriginal",
              monto_adeudo_restante AS "montoRestante",
              status,
              created_at AS "createdAt"
            FROM employee_cash_obligations
            WHERE empleada_id = $1 AND status IN ('pending', 'partial')
            ORDER BY created_at DESC`,
            [id],
          ),
        ]);

      return {
        actorType: 'employee',
        profile: employee,
        ratings,
        reports,
        sanctions,
        servicesHistory,
        extras,
        cashObligations,
      };
    }

    if (type === 'driver') {
      const driverRows = await this.dataSource.query(
        `SELECT
          d.id,
          d.nombre,
          d.telefono,
          d.vehiculo_modelo AS "vehiculoModelo",
          d.vehiculo_placas AS "vehiculoPlacas",
          d.vehiculo_color AS "vehiculoColor",
          d.estado,
          d.latitud,
          d.longitud,
          d.created_at AS "createdAt",
          u.telegram_chat_id AS "telegramChatId",
          u.activo AS "usuarioActivo"
        FROM choferes d
        LEFT JOIN usuarios u ON u.id = d.usuario_id
        WHERE d.id = $1`,
        [id],
      );
      const driver = driverRows[0];
      if (!driver) throw new NotFoundException('Chofer no encontrado');

      const [ratings, reports, sanctions, trips] = await Promise.all([
        this.dataSource.query(
          `SELECT
            r.id,
            r.direction,
            r.stars,
            r.comment,
            r.appeal_status AS "appealStatus",
            r.created_at AS "createdAt",
            e.nombre_artistico AS "empleadaNombre"
          FROM interaction_ratings r
          LEFT JOIN empleadas e ON e.id = r.employee_id
          WHERE r.driver_id = $1
          ORDER BY r.created_at DESC
          LIMIT 15`,
          [id],
        ),
        this.dataSource.query(
          `SELECT
            id,
            category,
            description,
            priority,
            status,
            outcome,
            resolution,
            created_at AS "createdAt"
          FROM conduct_reports
          WHERE subject_type = 'driver' AND subject_id = $1
          ORDER BY created_at DESC
          LIMIT 10`,
          [id],
        ),
        this.dataSource.query(
          `SELECT
            id,
            type,
            status,
            reason,
            starts_at AS "startsAt",
            ends_at AS "endsAt",
            created_at AS "createdAt"
          FROM disciplinary_sanctions
          WHERE subject_type = 'driver' AND subject_id = $1
          ORDER BY created_at DESC`,
          [id],
        ),
        this.dataSource.query(
          `SELECT
            v.id,
            v.tipo,
            v.estado,
            v.origen_direccion AS "origenDireccion",
            v.destino_direccion AS "destinoDireccion",
            v.costo_estimado AS "costoEstimado",
            v.created_at AS "createdAt",
            e.nombre_artistico AS "empleadaNombre"
          FROM viajes v
          LEFT JOIN servicios s ON s.id = v.servicio_id
          LEFT JOIN empleadas e ON e.id = s.empleada_id
          WHERE v.chofer_id = $1
          ORDER BY v.created_at DESC
          LIMIT 10`,
          [id],
        ),
      ]);

      return {
        actorType: 'driver',
        profile: driver,
        ratings,
        reports,
        sanctions,
        trips,
      };
    }

    if (type === 'boss') {
      const bossRows = await this.dataSource.query(
        `SELECT
          u.id,
          u.email,
          u.rol,
          u.activo,
          u.telegram_chat_id AS "telegramChatId",
          u.grupo_telegram_id AS "grupoTelegramId",
          u.created_at AS "createdAt"
        FROM usuarios u
        WHERE u.id = $1 AND u.rol IN ('jefe', 'admin')`,
        [id],
      );
      const boss = bossRows[0];
      if (!boss) throw new NotFoundException('Jefe no encontrado');

      const [employees, managedServices, reports] = await Promise.all([
        this.dataSource.query(
          `SELECT
            id,
            nombre_artistico AS "nombreArtistico",
            disponible,
            precio_base_hora AS "precioBaseHora",
            foto_perfil_url AS "fotoPerfilUrl"
          FROM empleadas
          WHERE jefe_id = $1 OR jefe_secundario_id = $1
          ORDER BY nombre_artistico ASC`,
          [id],
        ),
        this.dataSource.query(
          `SELECT
            s.id,
            s.estado,
            s.total_final AS "totalFinal",
            s.created_at AS "createdAt",
            e.nombre_artistico AS "empleadaNombre",
            c.nombre_telegram AS "clienteNombre"
          FROM servicios s
          LEFT JOIN empleadas e ON e.id = s.empleada_id
          LEFT JOIN clientes c ON c.id = s.cliente_id
          WHERE s.jefe_id = $1
          ORDER BY s.created_at DESC
          LIMIT 15`,
          [id],
        ),
        this.dataSource.query(
          `SELECT
            r.id,
            r.subject_type AS "subjectType",
            r.category,
            r.description,
            r.priority,
            r.status,
            r.outcome,
            r.created_at AS "createdAt"
          FROM conduct_reports r
          JOIN servicios s ON s.id = r.service_id
          WHERE s.jefe_id = $1
          ORDER BY r.created_at DESC
          LIMIT 10`,
          [id],
        ),
      ]);

      return {
        actorType: 'boss',
        profile: boss,
        employees,
        managedServices,
        reports,
      };
    }

    throw new NotFoundException('Tipo de actor no válido');
  }

  async analyzeIncidentRootCause(serviceId: string) {
    const serviceRows = await this.dataSource.query(
      `SELECT
        s.id,
        s.estado,
        s.metodo_pago AS "metodoPago",
        s.duracion_pactada_horas AS "duracionPactadaHoras",
        s.duracion_final_horas AS "duracionFinalHoras",
        s.precio_base_hora_pactado AS "precioBaseHoraPactado",
        s.total_final AS "totalFinal",
        s.hora_inicio_servicio AS "horaInicioServicio",
        s.hora_fin_servicio AS "horaFinServicio",
        s.created_at AS "createdAt",
        s.notas,
        c.id AS "clienteId",
        c.nombre_telegram AS "clienteNombre",
        e.id AS "empleadaId",
        e.nombre_artistico AS "empleadaNombre",
        j.id AS "jefeId",
        j.email AS "jefeEmail"
      FROM servicios s
      LEFT JOIN clientes c ON c.id = s.cliente_id
      LEFT JOIN empleadas e ON e.id = s.empleada_id
      LEFT JOIN usuarios j ON j.id = s.jefe_id
      WHERE s.id = $1`,
      [serviceId],
    );
    const service = serviceRows[0];
    if (!service) throw new NotFoundException('Servicio no encontrado');

    const [trips, ratings, reports, conversations] = await Promise.all([
      this.dataSource.query(
        `SELECT
          v.id,
          v.tipo,
          v.estado,
          v.proveedor_transporte AS "proveedorTransporte",
          v.hora_notificacion AS "horaNotificacion",
          v.hora_aceptacion AS "horaAceptacion",
          v.hora_llegada AS "horaLlegada",
          v.hora_inicio_viaje AS "horaInicioViaje",
          v.hora_fin_viaje AS "horaFinViaje",
          d.id AS "choferId",
          d.nombre AS "choferNombre",
          d.telefono AS "choferTelefono"
        FROM viajes v
        LEFT JOIN choferes d ON d.id = v.chofer_id
        WHERE v.servicio_id = $1
        ORDER BY v.created_at ASC`,
        [serviceId],
      ),
      this.dataSource.query(
        `SELECT
          r.id,
          r.direction,
          r.stars,
          r.comment,
          r.appeal_status AS "appealStatus",
          r.appeal_reason AS "appealReason",
          r.created_at AS "createdAt"
        FROM interaction_ratings r
        WHERE r.service_id = $1
        ORDER BY r.created_at ASC`,
        [serviceId],
      ),
      this.dataSource.query(
        `SELECT
          id,
          direction,
          reporter_type AS "reporterType",
          subject_type AS "subjectType",
          category,
          description,
          priority,
          status,
          outcome,
          created_at AS "createdAt"
        FROM conduct_reports
        WHERE service_id = $1
        ORDER BY created_at ASC`,
        [serviceId],
      ),
      this.dataSource.query(
        `SELECT
          id,
          emisor,
          mensaje,
          ia_activa AS "iaActiva",
          enviado_at AS "enviadoAt"
        FROM conversaciones_telegram
        WHERE servicio_id = $1
        ORDER BY enviado_at ASC
        LIMIT 50`,
        [serviceId],
      ),
    ]);

    // Algoritmo de detección de causa raíz
    const causes: Array<{
      category: string;
      culprit: 'driver' | 'employee' | 'boss' | 'client' | 'system';
      confidence: 'alta' | 'media' | 'baja';
      title: string;
      description: string;
    }> = [];

    // 1. Detección de retraso de transporte
    for (const trip of trips) {
      if (trip.horaNotificacion && trip.horaLlegada) {
        const notif = new Date(trip.horaNotificacion).getTime();
        const arrival = new Date(trip.horaLlegada).getTime();
        const diffMinutes = Math.round((arrival - notif) / 60000);
        if (diffMinutes > 40) {
          causes.push({
            category: 'demora_transporte',
            culprit: trip.proveedorTransporte === 'uber' ? 'system' : 'driver',
            confidence: 'alta',
            title: `Demora excesiva en traslado de ${trip.tipo} (+${diffMinutes} min)`,
            description: `El viaje con ${trip.choferNombre || 'Uber'} tardó ${diffMinutes} minutos desde la notificación hasta la llegada.`,
          });
        }
      }
      if (trip.estado === 'cancelado' || trip.estado === 'rechazado') {
        causes.push({
          category: 'fallo_chofer',
          culprit: 'driver',
          confidence: 'media',
          title: `Viaje de ${trip.tipo} ${trip.estado}`,
          description: `El chofer ${trip.choferNombre || 'asignado'} canceló o rechazó el traslado.`,
        });
      }
    }

    // 2. Detección de quejas de cliente en ratings/reportes
    for (const rating of ratings) {
      if (rating.stars <= 2) {
        const comment = (rating.comment || '').toLowerCase();
        if (comment.includes('tarde') || comment.includes('demor') || comment.includes('esper')) {
          causes.push({
            category: 'queja_impuntualidad',
            culprit: 'driver',
            confidence: 'alta',
            title: 'Queja de Cliente: Impuntualidad',
            description: `El cliente dejó ${rating.stars} estrellas señalando retraso: "${rating.comment}"`,
          });
        } else if (comment.includes('cobro') || comment.includes('dinero') || comment.includes('extra') || comment.includes('caro')) {
          causes.push({
            category: 'discrepancia_pago',
            culprit: 'employee',
            confidence: 'alta',
            title: 'Queja de Cliente: Cobro o Extras',
            description: `El cliente reportó inconformidad financiera: "${rating.comment}"`,
          });
        } else {
          causes.push({
            category: 'inconformidad_servicio',
            culprit: 'employee',
            confidence: 'media',
            title: 'Queja de Cliente: Mala Experiencia',
            description: `Calificación de ${rating.stars} estrellas: "${rating.comment || 'Sin comentario'}"`,
          });
        }
      }
    }

    // 3. Fricciones entre Empleada y Chofer
    for (const report of reports) {
      if (report.category === 'trato_inadecuado' || report.category === 'cobro') {
        causes.push({
          category: 'conflicto_interno',
          culprit: report.subjectType === 'driver' ? 'driver' : 'employee',
          confidence: 'alta',
          title: `Reporte de Conducta: ${report.category}`,
          description: `Reportado por ${report.reporterType} contra ${report.subjectType}: ${report.description}`,
        });
      }
    }

    return {
      service,
      trips,
      ratings,
      reports,
      conversations,
      detectedCauses: causes,
      triangulationSummary: {
        totalTrips: trips.length,
        ratingsCount: ratings.length,
        reportsCount: reports.length,
        chatMessagesCount: conversations.length,
        primaryDiagnosis: causes[0]?.title || 'No se detectaron anomalías severas en los registros.',
      },
    };
  }

  async listAllActors() {
    const [employees, drivers, bosses] = await Promise.all([
      this.dataSource.query(`
        SELECT
          e.id,
          e.nombre_artistico AS name,
          'employee' AS type,
          e.disponible,
          e.precio_base_hora AS "precioBaseHora",
          e.foto_perfil_url AS avatar,
          u.email AS "jefeEmail"
        FROM empleadas e
        LEFT JOIN usuarios u ON u.id = e.jefe_id
        ORDER BY e.nombre_artistico ASC
      `),
      this.dataSource.query(`
        SELECT
          d.id,
          d.nombre AS name,
          'driver' AS type,
          d.estado,
          d.telefono,
          d.vehiculo_modelo AS "vehiculoModelo"
        FROM choferes d
        ORDER BY d.nombre ASC
      `),
      this.dataSource.query(`
        SELECT
          u.id,
          u.email AS name,
          'boss' AS type,
          u.rol,
          u.activo
        FROM usuarios u
        WHERE u.rol IN ('jefe', 'admin')
        ORDER BY u.email ASC
      `),
    ]);

    return {
      employees,
      drivers,
      bosses,
    };
  }
}
