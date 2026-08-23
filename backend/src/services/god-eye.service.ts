import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

/** Respuesta cacheada del resumen del panel. */
type OverviewPayload = {
  metrics: Record<string, number>;
  activeServices: unknown[];
  pendingReports: unknown[];
};

/** Fila que devuelve la consulta unica de metricas del panel. */
type OverviewMetricsRow = {
  active_services: number;
  employees_total: number;
  employees_available: number;
  employees_busy: number;
  drivers_total: number;
  drivers_active: number;
  pending_receipts: number;
  recent_negative_ratings: number;
  cash_in_street: string | number;
  active_sanctions: number;
  pending_appeals: number;
  pending_reports: number;
  clients_total: number;
  pending_offers: number;
  revenue_today: string | number;
};

@Injectable()
export class GodEyeService {
  /** Ventana de cache del resumen. El panel se auto-refresca cada pocos segundos. */
  private static readonly OVERVIEW_CACHE_MS = 15_000;

  private overviewCache: {
    value: OverviewPayload;
    expiresAt: number;
  } | null = null;

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Las quince metricas del panel salen de una sola consulta con subconsultas
   * escalares, en vez de doce viajes independientes a Postgres. Sumando las dos
   * listas, cada carga pasa de catorce consultas a tres. El pool tiene veinte
   * conexiones: con la version anterior, tres administradores refrescando a la
   * vez lo saturaban.
   *
   * Ademas el resultado se cachea unos segundos, porque el panel se refresca
   * solo y los contadores no necesitan precision al instante.
   */
  async getOverview(): Promise<OverviewPayload> {
    const cached = this.overviewCache;
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const [metricsRow, pendingReportsList, activeServicesList] =
      await Promise.all([
        this.queryOverviewMetrics(),
        this.queryPendingReports(),
        this.queryActiveServices(),
      ]);

    const value: OverviewPayload = {
      metrics: {
        activeServices: metricsRow.active_services ?? 0,
        employeesTotal: metricsRow.employees_total ?? 0,
        employeesAvailable: metricsRow.employees_available ?? 0,
        employeesBusy: metricsRow.employees_busy ?? 0,
        driversTotal: metricsRow.drivers_total ?? 0,
        driversActive: metricsRow.drivers_active ?? 0,
        pendingReceipts: metricsRow.pending_receipts ?? 0,
        recentNegativeRatings: metricsRow.recent_negative_ratings ?? 0,
        cashInStreet: Number(metricsRow.cash_in_street ?? 0),
        activeSanctions: metricsRow.active_sanctions ?? 0,
        pendingAppeals: metricsRow.pending_appeals ?? 0,
        pendingReports: metricsRow.pending_reports ?? 0,
        clientsTotal: metricsRow.clients_total ?? 0,
        pendingOffers: metricsRow.pending_offers ?? 0,
        revenueToday: Number(metricsRow.revenue_today ?? 0),
      },
      activeServices: activeServicesList,
      pendingReports: pendingReportsList,
    };

    this.overviewCache = {
      value,
      expiresAt: Date.now() + GodEyeService.OVERVIEW_CACHE_MS,
    };
    return value;
  }

  /** Los quince contadores del panel en una sola pasada. */
  private async queryOverviewMetrics(): Promise<OverviewMetricsRow> {
    const [row]: OverviewMetricsRow[] = await this.dataSource.query(`
      SELECT
        (SELECT COUNT(*)::int FROM servicios
          WHERE estado IN ('pendiente', 'en_curso')) AS active_services,
        (SELECT COUNT(*)::int FROM empleadas) AS employees_total,
        (SELECT COUNT(*)::int FROM empleadas WHERE disponible = true) AS employees_available,
        (SELECT COUNT(*)::int FROM empleadas WHERE disponible = false) AS employees_busy,
        (SELECT COUNT(*)::int FROM choferes) AS drivers_total,
        (SELECT COUNT(*)::int FROM choferes WHERE disponible = true) AS drivers_active,
        (SELECT COUNT(*)::int FROM payment_receipt_validations
          WHERE estado IN ('PENDIENTE', 'REVISION_MANUAL', 'pending')) AS pending_receipts,
        (SELECT COUNT(*)::int FROM interaction_ratings
          WHERE stars <= 2 AND created_at >= NOW() - INTERVAL '24 hours') AS recent_negative_ratings,
        (SELECT COALESCE(SUM(amount - paid_amount), 0)::numeric FROM employee_cash_obligations
          WHERE status = 'pending') AS cash_in_street,
        (SELECT COUNT(*)::int FROM disciplinary_sanctions
          WHERE status = 'active') AS active_sanctions,
        (SELECT COUNT(*)::int FROM interaction_ratings
          WHERE appeal_status = 'pending') AS pending_appeals,
        (SELECT COUNT(*)::int FROM conduct_reports
          WHERE status IN ('nuevo', 'en_revision')) AS pending_reports,
        (SELECT COUNT(*)::int FROM clientes) AS clients_total,
        (SELECT COUNT(*)::int FROM group_service_requests
          WHERE status IN ('esperando_jefe', 'seleccionando', 'reservada', 'esperando_pago')) AS pending_offers,
        (SELECT COALESCE(SUM(total_final), 0)::numeric FROM servicios
          WHERE estado = 'finalizado' AND hora_fin_servicio >= date_trunc('day', now())) AS revenue_today
    `);
    return row ?? ({} as OverviewMetricsRow);
  }

  private queryPendingReports() {
    return this.dataSource.query(`
      SELECT
        r.id,
        r.category,
        r.priority,
        r.description,
        r.created_at AS "createdAt",
        r.subject_type AS "subjectType",
        CASE
          WHEN r.subject_type = 'employee' THEN e.nombre_artistico
          WHEN r.subject_type = 'driver' THEN c.nombre
          ELSE NULL
        END AS "subjectName"
      FROM conduct_reports r
      LEFT JOIN empleadas e ON r.subject_type = 'employee' AND e.id = r.subject_id
      LEFT JOIN choferes c ON r.subject_type = 'driver' AND c.id = r.subject_id
      WHERE r.status IN ('nuevo', 'en_revision')
      ORDER BY r.created_at DESC
      LIMIT 5
    `);
  }

  private queryActiveServices() {
    return this.dataSource.query(`

      SELECT
        s.id,
        s.service_type AS "serviceType",
        s.estado,
        s.metodo_pago AS "metodoPago",
        s.duracion_pactada_horas AS "duracionPactadaHoras",
        s.duracion_final_horas AS "duracionFinalHoras",
        s.precio_base_hora_pactado AS "precioBaseHoraPactado",
        s.total_final AS "totalFinal",
        s.ia_activa AS "iaActiva",
        s.hora_inicio_servicio AS "horaInicioServicio",
        s.hora_fin_servicio AS "horaFinServicio",
        s.estado_liquidacion AS "estadoLiquidacion",
        s.created_at AS "createdAt",
        s.notas,
        c.id AS "clienteId",
        c.nombre_telegram AS "clienteNombre",
        e.id AS "empleadaId",
        e.nombre_artistico AS "empleadaNombre",
        e.foto_perfil_url AS "empleadaFoto",
        u.id AS "jefeId",
        u.email AS "jefeEmail",
        COALESCE(
          (
            SELECT json_agg(json_build_object(
              'id', v.id,
              'tipo', v.tipo,
              'estado', v.estado,
              'tarifa', v.tarifa,
              'proveedorTransporte', v.proveedor_transporte,
              'uberScreenshotUrl', v.uber_screenshot_url,
              'telegramUberFileId', v.telegram_uber_file_id,
              'fareConfirmedAt', v.fare_confirmed_at,
              'choferNombre', ch.nombre
            ))
            FROM viajes v
            LEFT JOIN choferes ch ON ch.id = v.chofer_id
            WHERE v.servicio_id = s.id
          ),
          '[]'::json
        ) AS "viajes",
        (
          SELECT COUNT(*)::int
          FROM payment_receipt_validations prv
          WHERE prv.servicio_id = s.id AND prv.estado = 'pendiente'
        ) AS "pendingReceiptsCount"
      FROM servicios s
      LEFT JOIN clientes c ON c.id = s.cliente_id
      LEFT JOIN empleadas e ON e.id = s.empleada_id
      LEFT JOIN usuarios u ON u.id = s.jefe_id
      WHERE s.estado IN ('pendiente', 'en_curso')
      ORDER BY s.created_at DESC
      LIMIT 25
    `);
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
          e.apartment_id AS "apartmentId",
          u.email AS "jefeEmail",
          u.telegram_chat_id AS "jefeTelegram",
          u2.email AS "jefeSecundarioEmail",
          usr.telefono AS "telefono",
          usr.telegram_chat_id AS "telegramChatId",
          usr.activo AS "usuarioActivo",
          apt.nombre AS "apartmentNombre",
          apt.direccion AS "apartmentDireccion"
        FROM empleadas e
        LEFT JOIN usuarios u ON u.id = e.jefe_id
        LEFT JOIN usuarios u2 ON u2.id = e.jefe_secundario_id
        LEFT JOIN usuarios usr ON usr.id = e.usuario_id
        LEFT JOIN apartments apt ON apt.id = e.apartment_id
        WHERE e.id = $1`,
        [id],
      );
      const employee = employeeRows[0];
      if (!employee) throw new NotFoundException('Empleada no encontrada');

      const [
        ratings,
        ratingsSummaryRows,
        reports,
        sanctions,
        services,
        extras,
        cashObligations,
        liquidationDebts,
        recentSettlement,
        onboardingRows,
        candidateScreeningRows,
        weeklyPhotos,
        challenges,
        rankingMap,
      ] = await Promise.all([
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
            LIMIT 30`,
          [id],
        ),
        this.dataSource.query(
          `SELECT
              direction,
              COUNT(*)::int AS count,
              COALESCE(ROUND(AVG(stars)::numeric, 1), 0)::float AS average,
              COUNT(*) FILTER (WHERE stars = 5)::int AS stars_5,
              COUNT(*) FILTER (WHERE stars = 4)::int AS stars_4,
              COUNT(*) FILTER (WHERE stars = 3)::int AS stars_3,
              COUNT(*) FILTER (WHERE stars = 2)::int AS stars_2,
              COUNT(*) FILTER (WHERE stars = 1)::int AS stars_1
            FROM interaction_ratings
            WHERE employee_id = $1 AND (appeal_status IS NULL OR appeal_status != 'overturned')
            GROUP BY direction`,
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
              fine_amount AS "fineAmount",
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
              s.service_type AS "serviceType",
              s.estado,
              s.metodo_pago AS "metodoPago",
              s.duracion_pactada_horas AS "duracionPactadaHoras",
              s.duracion_final_horas AS "duracionFinalHoras",
              s.precio_base_hora_pactado AS "precioBaseHoraPactado",
              s.total_final AS "totalFinal",
              s.hora_inicio_servicio AS "horaInicioServicio",
              s.hora_fin_servicio AS "horaFinServicio",
              s.estado_liquidacion AS "estadoLiquidacion",
              s.ia_activa AS "iaActiva",
              s.calificacion,
              s.comentarios_calificacion AS "comentariosCalificacion",
              s.location_name_snapshot AS "hotelODomicilio",
              s.location_address_snapshot AS "ubicacion",
              s.location_name_snapshot AS "locationName",
              s.location_address_snapshot AS "locationAddress",
              s.notas,
              s.created_at AS "createdAt",
              c.id AS "clienteId",
              c.nombre_telegram AS "clienteNombre",
              c.telegram_chat_id::text AS "clienteTelegramChatId",
              c.telegram_chat_id::text AS "clienteTelefono",
              j.email AS "jefeEmail",
              COALESCE(
                (
                  SELECT json_agg(json_build_object(
                    'id', v.id,
                    'tipo', v.tipo,
                    'estado', v.estado,
                    'tarifa', v.tarifa,
                    'proveedorTransporte', v.proveedor_transporte,
                    'uberScreenshotUrl', v.uber_screenshot_url,
                    'telegramUberFileId', v.telegram_uber_file_id,
                    'fareConfirmedAt', v.fare_confirmed_at,
                    'choferNombre', ch.nombre,
                    'choferTelefono', ch.telefono,
                    'vehiculoModelo', ch.vehiculo_modelo
                  ))
                  FROM viajes v
                  LEFT JOIN choferes ch ON ch.id = v.chofer_id
                  WHERE v.servicio_id = s.id
                ),
                '[]'::json
              ) AS "viajes",
              (
                SELECT COUNT(*)::int
                FROM payment_receipt_validations prv
                WHERE prv.servicio_id = s.id AND prv.estado = 'pendiente'
              ) AS "pendingReceiptsCount",
              COALESCE(
                (
                  SELECT json_agg(json_build_object(
                    'nombre', COALESCE(ec.nombre, 'Extra'),
                    'precio', es.precio_cobrado
                  ))
                  FROM extras_servicio es
                  LEFT JOIN extras_catalogo ec ON ec.id = es.extra_catalogo_id
                  WHERE es.servicio_id = s.id
                ),
                '[]'::json
              ) AS "extrasServicio"
            FROM servicios s
            LEFT JOIN clientes c ON c.id = s.cliente_id
            LEFT JOIN usuarios j ON j.id = s.jefe_id
            WHERE s.empleada_id = $1
            ORDER BY s.created_at DESC
            LIMIT 25`,
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
              service_id AS "serviceId",
              amount AS "montoOriginal",
              paid_amount AS "montoPagado",
              (amount - paid_amount) AS "montoRestante",
              status,
              created_at AS "createdAt"
            FROM employee_cash_obligations
            WHERE employee_id = $1
            ORDER BY created_at DESC
            LIMIT 10`,
          [id],
        ),
        this.dataSource.query(
          `SELECT
              id,
              amount,
              description,
              status,
              created_at AS "createdAt"
            FROM liquidation_debts
            WHERE employee_id = $1
            ORDER BY created_at DESC
            LIMIT 10`,
          [id],
        ),
        this.dataSource.query(
          `SELECT
              id,
              week_start AS "semanaInicio",
              week_end AS "semanaFin",
              net_employee_pay AS "netAmount",
              gross_employee_pay AS "grossAmount",
              cash_offset AS "cashOffset",
              confirmed_at AS "confirmedAt"
            FROM employee_weekly_settlements
            WHERE employee_id = $1
            ORDER BY week_start DESC
            LIMIT 1`,
          [id],
        ),
        this.dataSource.query(
          `SELECT
              eo.id,
              eo.status,
              eo.attempt_count AS "attemptCount",
              eo.best_score AS "bestScore",
              eo.trust_score AS "trustScore",
              eo.assigned_at AS "assignedAt",
              eo.completed_at AS "completedAt",
              COALESCE(
                (
                  SELECT json_agg(json_build_object(
                    'id', qa.id,
                    'attemptNumber', qa.attempt_number,
                    'status', qa.status,
                    'score', qa.score,
                    'correctAnswers', qa.correct_answers,
                    'totalQuestions', qa.total_questions,
                    'startedAt', qa.started_at,
                    'completedAt', qa.completed_at
                  ) ORDER BY qa.attempt_number ASC)
                  FROM questionnaire_attempts qa
                  WHERE qa.onboarding_id = eo.id
                ),
                '[]'::json
              ) AS "attempts"
            FROM employee_onboardings eo
            WHERE eo.employee_id = $1 OR eo.user_id = (SELECT usuario_id FROM empleadas WHERE id = $1)
            ORDER BY eo.assigned_at DESC
            LIMIT 1`,
          [id],
        ),
        this.dataSource.query(
          `SELECT
              cs.id,
              cs.status,
              cs.candidate_name AS "candidateName",
              cs.candidate_phone AS "candidatePhone",
              cs.created_at AS "createdAt",
              cs.started_at AS "startedAt",
              cs.completed_at AS "completedAt"
            FROM candidate_screenings cs
            WHERE cs.promoted_employee_id = $1
            ORDER BY cs.created_at DESC
            LIMIT 1`,
          [id],
        ),
        this.dataSource.query(
          `SELECT
              wps.id,
              wps.url,
              wps.estado,
              wps.semana_inicio AS "semanaInicio",
              wps.created_at AS "createdAt"
            FROM weekly_photo_submissions wps
            WHERE wps.empleada_id = $1
            ORDER BY wps.created_at DESC
            LIMIT 10`,
          [id],
        ),
        this.dataSource.query(
          `SELECT
              c.id,
              c.title AS "titulo",
              c.metric AS "tipo",
              c.status AS "estado",
              c.starts_at AS "fechaInicio",
              c.ends_at AS "fechaFin",
              cp.created_at AS "inscritoAt"
            FROM challenge_participants cp
            JOIN challenges c ON c.id = cp.challenge_id
            WHERE cp.participant_id = $1
            ORDER BY c.created_at DESC
            LIMIT 5`,
          [id],
        ),
        this.getEmployeeRankingMap(),
      ]);

      const totalCashDue = cashObligations
        .filter((o: any) => o.status === 'pending')
        .reduce((sum: number, o: any) => sum + Number(o.montoRestante || 0), 0);

      const totalDebt = liquidationDebts
        .filter((d: any) => d.status === 'pending')
        .reduce((sum: number, d: any) => sum + Number(d.amount || 0), 0);

      const finances = {
        totalCashDue,
        totalDebt,
        totalOwed: totalCashDue + totalDebt,
        cashObligations,
        liquidationDebts,
        recentSettlement: recentSettlement[0] || null,
      };

      const onboarding = onboardingRows[0]
        ? {
            ...onboardingRows[0],
            screening: candidateScreeningRows[0] || null,
          }
        : candidateScreeningRows[0]
          ? {
              status: candidateScreeningRows[0].status,
              screening: candidateScreeningRows[0],
              attempts: [],
            }
          : null;

      // Desglose de estrellas por Clientes vs Choferes
      const clientRow = ratingsSummaryRows.find(
        (r: any) => r.direction === 'client_to_employee',
      );
      const driverRow = ratingsSummaryRows.find(
        (r: any) => r.direction === 'driver_to_employee',
      );

      const ratingsSummary = {
        client: {
          count: clientRow ? Number(clientRow.count) : 0,
          average: clientRow ? Number(clientRow.average) : 0,
          stars_5: clientRow ? Number(clientRow.stars_5) : 0,
          stars_4: clientRow ? Number(clientRow.stars_4) : 0,
          stars_3: clientRow ? Number(clientRow.stars_3) : 0,
          stars_2: clientRow ? Number(clientRow.stars_2) : 0,
          stars_1: clientRow ? Number(clientRow.stars_1) : 0,
        },
        driver: {
          count: driverRow ? Number(driverRow.count) : 0,
          average: driverRow ? Number(driverRow.average) : 0,
          stars_5: driverRow ? Number(driverRow.stars_5) : 0,
          stars_4: driverRow ? Number(driverRow.stars_4) : 0,
          stars_3: driverRow ? Number(driverRow.stars_3) : 0,
          stars_2: driverRow ? Number(driverRow.stars_2) : 0,
          stars_1: driverRow ? Number(driverRow.stars_1) : 0,
        },
      };

      const ranking = rankingMap.get(id) || null;

      return {
        actorType: 'employee',
        profile: employee,
        ratings,
        ratingsSummary,
        ranking,
        reports,
        sanctions,
        services,
        servicesHistory: services,
        extras,
        cashObligations,
        finances,
        onboarding,
        weeklyPhotos,
        challenges,
      };
    }

    if (type === 'driver') {
      const driverRows = await this.dataSource.query(
        `SELECT
          d.id,
          d.nombre,
          d.telefono,
          d.vehiculo_marca AS "vehiculoMarca",
          d.vehiculo_modelo AS "vehiculoModelo",
          d.vehiculo_placa AS "vehiculoPlaca",
          d.vehiculo_color AS "vehiculoColor",
          d.disponible,
          d.ubicacion_lat AS "latitud",
          d.ubicacion_lng AS "longitud",
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
            fine_amount AS "fineAmount",
            status,
            reason,
            starts_at AS "startsAt",
            ends_at AS "endsAt",
            revocation_reason AS "revocationReason",
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
            v.tarifa AS "costoEstimado",
            v.hora_notificacion AS "createdAt",
            e.nombre_artistico AS "empleadaNombre"
          FROM viajes v
          LEFT JOIN servicios s ON s.id = v.servicio_id
          LEFT JOIN empleadas e ON e.id = s.empleada_id
          WHERE v.chofer_id = $1
          ORDER BY v.hora_notificacion DESC
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

      const [employees, managedServices, reports, sanctions] =
        await Promise.all([
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
          this.dataSource.query(
            `SELECT
            id,
            type,
            fine_amount AS "fineAmount",
            status,
            reason,
            starts_at AS "startsAt",
            ends_at AS "endsAt",
            revocation_reason AS "revocationReason",
            created_at AS "createdAt"
          FROM disciplinary_sanctions
          WHERE subject_type = 'boss' AND subject_id = $1
          ORDER BY created_at DESC
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
        sanctions,
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
          v.hora_inicio_viaje AS "horaInicioViaje",
          v.hora_fin_viaje AS "horaFinViaje",
          d.id AS "choferId",
          d.nombre AS "choferNombre",
          d.telefono AS "choferTelefono"
        FROM viajes v
        LEFT JOIN choferes d ON d.id = v.chofer_id
        WHERE v.servicio_id = $1
        ORDER BY v.hora_notificacion ASC`,
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
      if (trip.horaNotificacion && trip.horaFinViaje) {
        const notif = new Date(trip.horaNotificacion).getTime();
        const arrival = new Date(trip.horaFinViaje).getTime();
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
        if (
          comment.includes('tarde') ||
          comment.includes('demor') ||
          comment.includes('esper')
        ) {
          causes.push({
            category: 'queja_impuntualidad',
            culprit: 'driver',
            confidence: 'alta',
            title: 'Queja de Cliente: Impuntualidad',
            description: `El cliente dejó ${rating.stars} estrellas señalando retraso: "${rating.comment}"`,
          });
        } else if (
          comment.includes('cobro') ||
          comment.includes('dinero') ||
          comment.includes('extra') ||
          comment.includes('caro')
        ) {
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
      if (
        report.category === 'trato_inadecuado' ||
        report.category === 'cobro'
      ) {
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
        primaryDiagnosis:
          causes[0]?.title ||
          'No se detectaron anomalías severas en los registros.',
      },
    };
  }

  private async getEmployeeRankingMap(): Promise<
    Map<string, { position: number; total: number; score: number | null }>
  > {
    try {
      const [employees, confirmedReports] = await Promise.all([
        this.dataSource.query(`
          SELECT id, promedio_calificacion AS "promedioCalificacion", total_servicios_valorados AS "totalServiciosValorados"
          FROM empleadas
        `),
        this.dataSource.query(`
          SELECT employee_id, COUNT(*)::int AS confirmed
          FROM employee_reports
          WHERE status = 'resuelto' AND created_at >= NOW() - INTERVAL '90 days'
          GROUP BY employee_id
        `),
      ]);

      const confirmedMap = new Map(
        confirmedReports.map((r: any) => [r.employee_id, Number(r.confirmed)]),
      );

      const ranked = employees.map((emp: any) => {
        const confirmed = Number(confirmedMap.get(emp.id) || 0);
        const promedio =
          emp.promedioCalificacion != null
            ? Number(emp.promedioCalificacion)
            : null;
        const score =
          promedio != null
            ? Math.max(
                0,
                Math.round(
                  (Number(promedio) / 5) * 100 - Number(confirmed) * 8,
                ),
              )
            : null;
        return { id: emp.id, score };
      });

      ranked.sort((a: any, b: any) => {
        if (a.score == null && b.score == null) return 0;
        if (a.score == null) return 1;
        if (b.score == null) return -1;
        return b.score - a.score;
      });

      const total =
        ranked.filter((r: any) => r.score != null).length || ranked.length;
      const positions = new Map<
        string,
        { position: number; total: number; score: number | null }
      >();

      let pos = 0;
      for (const r of ranked) {
        if (r.score != null) {
          pos += 1;
          positions.set(r.id, { position: pos, total, score: r.score });
        } else {
          positions.set(r.id, { position: total, total, score: null });
        }
      }

      return positions;
    } catch {
      return new Map();
    }
  }

  async listAllActors() {
    const [employees, drivers, bosses, rankingMap] = await Promise.all([
      this.dataSource.query(`
        SELECT
          e.id,
          e.nombre_artistico AS name,
          'employee' AS type,
          e.disponible,
          e.precio_base_hora AS "precioBaseHora",
          e.foto_perfil_url AS avatar,
          u.email AS "jefeEmail",
          EXISTS(
            SELECT 1 FROM disciplinary_sanctions s
            WHERE s.subject_type = 'employee'
              AND s.subject_id = e.id
              AND s.status = 'active'
              AND (s.ends_at IS NULL OR s.ends_at > NOW())
          ) AS "sancionada"
        FROM empleadas e
        LEFT JOIN usuarios u ON u.id = e.jefe_id
        ORDER BY e.nombre_artistico ASC
      `),
      this.dataSource.query(`
        SELECT
          d.id,
          d.nombre AS name,
          'driver' AS type,
          d.disponible,
          d.telefono,
          d.vehiculo_modelo AS "vehiculoModelo",
          EXISTS(
            SELECT 1 FROM disciplinary_sanctions s
            WHERE s.subject_type = 'driver'
              AND s.subject_id = d.id
              AND s.status = 'active'
              AND (s.ends_at IS NULL OR s.ends_at > NOW())
          ) AS "sancionada"
        FROM choferes d
        ORDER BY d.nombre ASC
      `),
      this.dataSource.query(`
        SELECT
          u.id,
          COALESCE(u.nombre, u.email) AS name,
          u.email,
          'boss' AS type,
          u.rol,
          u.activo,
          EXISTS(
            SELECT 1 FROM disciplinary_sanctions s
            WHERE s.subject_type = 'boss'
              AND s.subject_id = u.id
              AND s.status = 'active'
              AND (s.ends_at IS NULL OR s.ends_at > NOW())
          ) AS "sancionada"
        FROM usuarios u
        WHERE u.rol IN ('jefe', 'admin')
        ORDER BY u.email ASC
      `),
      this.getEmployeeRankingMap(),
    ]);

    const employeesWithRanking = employees.map((emp: any) => {
      const r = rankingMap.get(emp.id);
      return {
        ...emp,
        rankingPosition: r?.position ?? null,
        totalEmployees: r?.total ?? employees.length,
        rankingScore: r?.score ?? null,
      };
    });

    return {
      employees: employeesWithRanking,
      drivers,
      bosses,
    };
  }
}
