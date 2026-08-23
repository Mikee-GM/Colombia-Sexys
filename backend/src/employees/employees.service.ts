import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, Not } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import {
  EmployeePortalData,
  EmployeePortalServiceItem,
  EmployeePortalActiveService,
} from './dto/employee-portal.dto';
import { Empleadas } from './entities/employee.entity';
import { Usuarios } from '../users/entities/user.entity';
import { EmpleadaFotos } from '../employee-photos/entities/employee-photo.entity';
import { ExtrasCatalogo } from '../catalog-extras/entities/catalog-extra.entity';
import { UploadService } from '../upload/upload.service';
import { EmployeeOnboarding } from '../employee-onboarding/entities/employee-onboarding.entity';
import { Servicios } from '../services/entities/service.entity';
import { WeeklyContentService } from '../weekly-content/weekly-content.service';
import { EmployeeCashObligation } from '../transport-operations/entities/employee-cash-obligation.entity';

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    @InjectRepository(Empleadas)
    private readonly empleadasRepository: Repository<Empleadas>,
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    @InjectRepository(EmpleadaFotos)
    private readonly empleadaFotosRepository: Repository<EmpleadaFotos>,
    private readonly dataSource: DataSource,
    private readonly uploadService: UploadService,
    private readonly weeklyContentService: WeeklyContentService,
  ) {}

  async create(createEmployeeDto: CreateEmployeeDto): Promise<Empleadas> {
    const {
      email,
      password,
      telegramChatId,
      nombreReal,
      nombreArtistico,
      slugCatalogo,
      fotoPerfilUrl,
      descripcion,
      estiloHabla,
      precioBaseHora,
      disponible,
      catalogoActivo,
      ubicacionLat,
      ubicacionLng,
      fotosExtra,
      jefeId,
      jefeSecundarioId,
      apartmentId,
      linkX,
      contactLabel,
      extras,
    } = createEmployeeDto;

    // 1. Validar que el email no esté registrado
    const usuarioExistente = await this.usuariosRepository.findOne({
      where: { email },
    });
    if (usuarioExistente) {
      throw new ConflictException(
        `El correo electrónico ${email} ya está registrado`,
      );
    }

    // 2. Validar que el slug no esté registrado
    const slugExistente = await this.empleadasRepository.findOne({
      where: { slugCatalogo },
    });
    if (slugExistente) {
      throw new ConflictException(
        `El slug de catálogo "${slugCatalogo}" ya está registrado`,
      );
    }

    // 3. Ejecutar transacción para creación atómica
    const result = await this.dataSource.transaction(async (manager) => {
      // A. Hashear la contraseña
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // B. Crear el usuario
      const nuevoUsuario = manager.create(Usuarios, {
        email,
        passwordHash,
        rol: 'empleada',
        telegramChatId: telegramChatId || null,
      });
      const usuarioGuardado = await manager.save(Usuarios, nuevoUsuario);

      // C. Crear la empleada vinculada
      const nuevaEmpleada = manager.create(Empleadas, {
        usuarioId: usuarioGuardado.id,
        nombreReal,
        nombreArtistico,
        slugCatalogo,
        fotoPerfilUrl: fotoPerfilUrl || null,
        descripcion: descripcion || null,
        estiloHabla: estiloHabla || null,
        linkX: linkX || null,
        contactLabel: contactLabel || null,
        precioBaseHora: Number(precioBaseHora),
        disponible: disponible ?? false,
        catalogoActivo: catalogoActivo ?? true,
        ubicacionLat: ubicacionLat ? Number(ubicacionLat) : null,
        ubicacionLng: ubicacionLng ? Number(ubicacionLng) : null,
        jefeId: jefeId || null,
        jefeSecundarioId: jefeSecundarioId || null,
        apartmentId: apartmentId || null,
      });
      const empleadaGuardada = await manager.save(Empleadas, nuevaEmpleada);

      // D. Crear fotos extras de ser necesario
      const fotosGuardadas: EmpleadaFotos[] = [];
      if (fotosExtra && fotosExtra.length > 0) {
        for (let i = 0; i < fotosExtra.length; i++) {
          const nuevaFoto = manager.create(EmpleadaFotos, {
            empleadaId: empleadaGuardada.id,
            url: fotosExtra[i],
            orden: i,
          });
          const fotoGuardada = await manager.save(EmpleadaFotos, nuevaFoto);
          fotosGuardadas.push(fotoGuardada);
        }
      }

      // E. Crear extras del catálogo de ser necesario
      const extrasGuardados: ExtrasCatalogo[] = [];
      if (extras && extras.length > 0) {
        for (const ext of extras) {
          const nuevoExtra = manager.create(ExtrasCatalogo, {
            empleadaId: empleadaGuardada.id,
            nombre: ext.nombre,
            precio: Number(ext.precio),
            modelosVinculadasIds: ext.modelosVinculadasIds || [],
            speechPersonalizado: ext.speechPersonalizado || null,
            activo: true,
          });
          const extraGuardado = await manager.save(ExtrasCatalogo, nuevoExtra);
          extrasGuardados.push(extraGuardado);
        }
      }

      empleadaGuardada.usuario = usuarioGuardado;
      empleadaGuardada.empleadaFotos = fotosGuardadas;
      empleadaGuardada.extrasCatalogos = extrasGuardados;
      return empleadaGuardada;
    });

    // Omitir passwordHash de la respuesta
    if (result.usuario) {
      const { passwordHash: _, ...usuarioSinPassword } = result.usuario;
      result.usuario = usuarioSinPassword as Usuarios;
    }

    return result;
  }

  async findAll(): Promise<Empleadas[]> {
    const employees = await this.empleadasRepository.find({
      // Consultas separadas por coleccion en vez de un LEFT JOIN unico: con seis
      // relaciones el join producia el producto cartesiano de todas ellas.
      relationLoadStrategy: 'query',
      relations: {
        usuario: true,
        empleadaFotos: true,
        fotosExclusivas: true,
        extrasCatalogos: true,
        jefe: true,
        jefeSecundario: true,
      },
    });
    const withTrust = await this.attachTrustScores(employees);
    const withAvailability = await this.attachCatalogAvailability(withTrust);
    const withBots = await this.attachBotUsernames(withAvailability);
    return await this.attachWeeklyContentMetrics(withBots);
  }

  /**
   * Catalogo publico: lo sirve `GET /catalog/employees` sin autenticacion, asi
   * que la respuesta no puede arrastrar entidades `Usuarios`. Solo se carga la
   * relacion `usuario` para filtrar por `activo`, y se elimina del resultado
   * antes de devolverlo; el frontend unicamente usa los ids escalares
   * (`usuarioId`, `jefeId`, `jefeSecundarioId`), que sí son columnas propias.
   */
  async findAllActive(): Promise<Empleadas[]> {
    const employees = await this.empleadasRepository.find({
      where: { catalogoActivo: true },
      relationLoadStrategy: 'query',
      relations: {
        usuario: true,
        empleadaFotos: true,
        extrasCatalogos: true,
      },
    });
    const sanctionedRows: Array<{ subject_id: string }> =
      employees.length === 0
        ? []
        : await this.dataSource.query(
            `SELECT DISTINCT subject_id
             FROM disciplinary_sanctions
             WHERE subject_type = 'employee'
               AND status = 'active'
               AND starts_at <= now()
               AND (type = 'permanent_ban' OR ends_at > now())
               AND subject_id = ANY($1::uuid[])`,
            [employees.map((employee) => employee.id)],
          );
    const sanctioned = new Set(sanctionedRows.map((row) => row.subject_id));
    const publicEmployees = employees.filter(
      (employee) => !sanctioned.has(employee.id) && employee.usuario?.activo,
    );
    const ranked = await this.rankEmployeesByScore(publicEmployees);
    const enriched = await this.attachBotUsernames(
      await this.attachCatalogAvailability(
        await this.attachTrustScores(ranked),
      ),
    );
    return enriched.map((employee) => this.stripUserRelations(employee));
  }

  /**
   * Quita del objeto las relaciones que son `Usuarios`. Son datos internos
   * (email, telefono, telegramChatId) que no deben salir por una ruta publica.
   */
  private stripUserRelations(employee: Empleadas): Empleadas {
    const {
      usuario: _usuario,
      jefe: _jefe,
      jefeSecundario: _jefeSecundario,
      ...safe
    } = employee;
    return safe as Empleadas;
  }

  /**
   * Ordena empleadas por el mismo score usado en los KPIs (calificación − reportes
   * confirmados), para que el catálogo y las listas de candidatas prioricen a las
   * de mejor desempeño en vez de un orden arbitrario de base de datos.
   */
  private async rankEmployeesByScore(
    employees: Empleadas[],
  ): Promise<Empleadas[]> {
    if (employees.length === 0) return employees;
    const confirmedRows: Array<{ subject_id: string; confirmed: number }> =
      await this.dataSource.query(
        `SELECT subject_id, COUNT(*)::int AS confirmed
         FROM conduct_reports
         WHERE subject_type = 'employee' AND outcome = 'confirmado'
           AND created_at >= now() - interval '90 days'
           AND subject_id = ANY($1::uuid[])
         GROUP BY subject_id`,
        [employees.map((employee) => employee.id)],
      );
    const confirmedByEmployee = new Map(
      confirmedRows.map((row) => [row.subject_id, row.confirmed]),
    );
    const withScore = employees.map((employee) => {
      const rating =
        employee.promedioCalificacion != null
          ? Number(employee.promedioCalificacion)
          : 2.5;
      const confirmed = confirmedByEmployee.get(employee.id) ?? 0;
      const score = Math.max(0, Math.round((rating / 5) * 100 - confirmed * 8));
      return { employee, score };
    });
    withScore.sort(
      (a, b) =>
        b.score - a.score ||
        a.employee.nombreArtistico.localeCompare(b.employee.nombreArtistico),
    );
    return withScore.map((entry) => entry.employee);
  }

  async findOne(id: string): Promise<Empleadas> {
    const empleada = await this.empleadasRepository.findOne({
      where: { id },
      relations: {
        usuario: true,
        empleadaFotos: true,
        fotosExclusivas: true,
        extrasCatalogos: true,
        jefe: true,
        jefeSecundario: true,
      },
    });

    if (!empleada) {
      throw new NotFoundException(`Empleada con ID ${id} no encontrado`);
    }

    const [employeeWithAvailability] = await this.attachBotUsernames(
      await this.attachCatalogAvailability(
        await this.attachTrustScores([empleada]),
      ),
    );
    const [finalEmployee] = await this.attachWeeklyContentMetrics([
      employeeWithAvailability,
    ]);
    return finalEmployee;
  }

  private async attachWeeklyContentMetrics(
    employees: Empleadas[],
  ): Promise<Empleadas[]> {
    if (!employees.length) return employees;
    try {
      const [pendingCounts, statuses] = await Promise.all([
        this.weeklyContentService.getPendingCountByEmployee(),
        this.weeklyContentService.getWeeklyStatusForEmployees(),
      ]);

      return employees.map((emp) => {
        emp.pendingWeeklyPhotosCount = pendingCounts[emp.id] || 0;
        emp.weeklyContentStatus = statuses[emp.id] || 'al_dia';
        return emp;
      });
    } catch {
      return employees;
    }
  }

  private async attachCatalogAvailability(
    employees: Empleadas[],
  ): Promise<Empleadas[]> {
    if (!employees.length) return employees;
    const ids = employees.map((employee) => employee.id);
    const services = await this.dataSource.getRepository(Servicios).find({
      where: [
        { empleadaId: In(ids), estado: 'en_curso' },
        { empleadaId: In(ids), estado: 'agendado' },
        { empleadaId: In(ids), estado: 'pendiente' },
      ],
      select: {
        id: true,
        empleadaId: true,
        estado: true,
        horaInicioServicio: true,
        duracionPactadaHoras: true,
        servicioPrevioId: true,
      },
      order: { createdAt: 'ASC' },
    });
    const groupRows: Array<{
      employee_id: string;
      estado: string;
      hora_inicio_servicio: Date | null;
      duracion_pactada_horas: string;
    }> = await this.dataSource.query(
      `SELECT p.employee_id, s.estado, s.hora_inicio_servicio,
              s.duracion_pactada_horas
       FROM service_participants p
       INNER JOIN servicios s ON s.id = p.service_id
       WHERE p.employee_id = ANY($1::uuid[])
         AND p.status IN ('reservada','pendiente_pago','activa')
         AND s.estado IN ('pendiente','agendado','en_curso')`,
      [ids],
    );
    const activeByEmployee = new Map(
      services
        .filter((service) => service.estado === 'en_curso')
        .map((service) => [service.empleadaId, service]),
    );
    for (const row of groupRows.filter((item) => item.estado === 'en_curso')) {
      if (!activeByEmployee.has(row.employee_id)) {
        activeByEmployee.set(row.employee_id, {
          empleadaId: row.employee_id,
          horaInicioServicio: row.hora_inicio_servicio,
          duracionPactadaHoras: Number(row.duracion_pactada_horas),
          estado: 'en_curso',
        } as Servicios);
      }
    }
    const queuedEmployees = new Set(
      services
        .filter(
          (service) =>
            service.servicioPrevioId &&
            (service.estado === 'pendiente' || service.estado === 'agendado'),
        )
        .map((service) => service.empleadaId),
    );
    for (const row of groupRows.filter((item) => item.estado !== 'en_curso')) {
      queuedEmployees.add(row.employee_id);
    }

    const sanctionedRows: Array<{ subject_id: string }> =
      ids.length === 0
        ? []
        : await this.dataSource.query(
            `SELECT DISTINCT subject_id
             FROM disciplinary_sanctions
             WHERE subject_type = 'employee'
               AND status = 'active'
               AND starts_at <= now()
               AND (type = 'permanent_ban' OR ends_at > now())
               AND subject_id = ANY($1::uuid[])`,
            [ids],
          );
    const sanctionedSet = new Set(sanctionedRows.map((r) => r.subject_id));

    return employees.map((employee) => {
      employee.clientRatingAverage = employee.promedioCalificacion;
      employee.clientRatingCount = employee.totalServiciosValorados;
      const isSanctioned = sanctionedSet.has(employee.id);
      employee.sancionada = isSanctioned;

      const active = activeByEmployee.get(employee.id);
      const estimatedAvailableAt =
        active?.horaInicioServicio && active.duracionPactadaHoras
          ? new Date(
              active.horaInicioServicio.getTime() +
                Number(active.duracionPactadaHoras) * 3_600_000,
            )
          : null;
      employee.availabilityStatus = isSanctioned
        ? 'inactiva'
        : !employee.catalogoActivo
          ? 'inactiva'
          : active || !employee.disponible
            ? 'ocupada'
            : 'disponible';
      employee.estimatedAvailableAt = estimatedAvailableAt;
      employee.canScheduleNext =
        !isSanctioned && Boolean(active) && !queuedEmployees.has(employee.id);
      return employee;
    });
  }

  /**
   * Stampa el username del bot propio de cada modelo. El catálogo lo usa para
   * mandar al cliente al bot correcto en vez de al central.
   */
  private async attachBotUsernames(
    employees: Empleadas[],
  ): Promise<Empleadas[]> {
    if (employees.length === 0) return employees;
    try {
      const rows: Array<{ employee_id: string; bot_username: string | null }> =
        await this.dataSource.query(
          `SELECT employee_id, bot_username
           FROM employee_telegram_bots
           WHERE status = 'activo' AND bot_username IS NOT NULL`,
        );
      const byEmployee = new Map(
        rows.map((row) => [row.employee_id, row.bot_username]),
      );
      for (const employee of employees) {
        employee.telegramBotUsername = byEmployee.get(employee.id) ?? null;
      }
    } catch {
      // Durante el despliegue el backend puede levantar antes de que corra la
      // migración. El catálogo no debe caerse por eso: sin bots dedicados, los
      // enlaces apuntan al bot central, que es el comportamiento de siempre.
      for (const employee of employees) {
        employee.telegramBotUsername = null;
      }
    }
    return employees;
  }

  private async attachTrustScores(
    employees: Empleadas[],
  ): Promise<Empleadas[]> {
    if (employees.length === 0) return employees;

    const onboardings = await this.dataSource
      .getRepository(EmployeeOnboarding)
      .find({
        where: {
          employeeId: In(employees.map((employee) => employee.id)),
          active: true,
        },
        select: {
          employeeId: true,
          attemptCount: true,
          trustScore: true,
        },
      });
    const onboardingByEmployee = new Map(
      onboardings.map((onboarding) => [onboarding.employeeId, onboarding]),
    );

    return employees.map((employee) => {
      const onboarding = onboardingByEmployee.get(employee.id);
      return Object.assign(employee, {
        trustScore:
          onboarding && onboarding.attemptCount > 0
            ? onboarding.trustScore
            : null,
      });
    });
  }

  async update(
    id: string,
    updateEmployeeDto: UpdateEmployeeDto,
  ): Promise<Empleadas> {
    const empleada = await this.findOne(id);

    // Si se actualiza el slug, verificar que sea único
    if (
      updateEmployeeDto.slugCatalogo &&
      updateEmployeeDto.slugCatalogo !== empleada.slugCatalogo
    ) {
      const slugExistente = await this.empleadasRepository.findOne({
        where: { slugCatalogo: updateEmployeeDto.slugCatalogo, id: Not(id) },
      });
      if (slugExistente) {
        throw new ConflictException(
          `El slug de catálogo "${updateEmployeeDto.slugCatalogo}" ya está registrado por otra empleada`,
        );
      }
    }

    // Ejecutar transacción si hay fotos extras o servicios extras a actualizar
    const { fotosExtra, extras, ...camposAActualizar } = updateEmployeeDto;

    // A. Si cambia la foto de perfil, eliminar la anterior de R2
    if (
      camposAActualizar.fotoPerfilUrl !== undefined &&
      camposAActualizar.fotoPerfilUrl !== empleada.fotoPerfilUrl
    ) {
      if (empleada.fotoPerfilUrl) {
        try {
          await this.uploadService.deleteFile(empleada.fotoPerfilUrl);
        } catch (err) {
          this.logger.error(
            'Error al eliminar fotoPerfilUrl antigua de R2:',
            err,
          );
        }
      }
    }

    // B. Si se envían fotos extras, identificar cuáles fueron removidas y borrarlas de R2
    if (fotosExtra !== undefined) {
      const oldUrls = empleada.empleadaFotos
        ? empleada.empleadaFotos.map((f) => f.url)
        : [];
      const urlsToDelete = oldUrls.filter((url) => !fotosExtra.includes(url));

      for (const url of urlsToDelete) {
        if (url) {
          try {
            await this.uploadService.deleteFile(url);
          } catch (err) {
            this.logger.error(
              'Error al eliminar foto extra obsoleta de R2:',
              err,
            );
          }
        }
      }
    }

    await this.dataSource.transaction(async (manager) => {
      // 1. Actualizar campos del perfil principal
      const updateData: any = { ...camposAActualizar };
      if (camposAActualizar.precioBaseHora !== undefined) {
        updateData.precioBaseHora = Number(camposAActualizar.precioBaseHora);
      }
      if (camposAActualizar.ubicacionLat !== undefined) {
        updateData.ubicacionLat =
          camposAActualizar.ubicacionLat !== null
            ? Number(camposAActualizar.ubicacionLat)
            : null;
      }
      if (camposAActualizar.ubicacionLng !== undefined) {
        updateData.ubicacionLng =
          camposAActualizar.ubicacionLng !== null
            ? Number(camposAActualizar.ubicacionLng)
            : null;
      }
      await manager.update(Empleadas, id, updateData);

      // 2. Actualizar fotos extras si se especifican
      if (fotosExtra !== undefined) {
        // Borrar fotos anteriores de la base de datos
        await manager.delete(EmpleadaFotos, { empleadaId: id });

        // Insertar nuevas fotos
        for (let i = 0; i < fotosExtra.length; i++) {
          const nuevaFoto = manager.create(EmpleadaFotos, {
            empleadaId: id,
            url: fotosExtra[i],
            orden: i,
          });
          await manager.save(EmpleadaFotos, nuevaFoto);
        }
      }

      // 3. Actualizar extras si se especifican
      if (extras !== undefined) {
        // Obtener los extras actuales
        const currentExtras = await manager.find(ExtrasCatalogo, {
          where: { empleadaId: id },
        });

        // Identificar los extras recibidos por nombre para actualizar o crear
        const extrasNombresRecibidos = extras.map((e) =>
          e.nombre.toLowerCase().trim(),
        );

        // A. Desactivar/Eliminar los que no se enviaron
        for (const current of currentExtras) {
          if (
            !extrasNombresRecibidos.includes(
              current.nombre.toLowerCase().trim(),
            )
          ) {
            try {
              await manager.delete(ExtrasCatalogo, { id: current.id });
            } catch (e) {
              await manager.update(ExtrasCatalogo, current.id, {
                activo: false,
              });
            }
          }
        }

        // B. Crear o actualizar los que sí se enviaron
        for (const ext of extras) {
          const matched = currentExtras.find(
            (c) =>
              c.nombre.toLowerCase().trim() === ext.nombre.toLowerCase().trim(),
          );

          if (matched) {
            await manager.update(ExtrasCatalogo, matched.id, {
              precio: Number(ext.precio),
              modelosVinculadasIds: ext.modelosVinculadasIds || [],
              speechPersonalizado: ext.speechPersonalizado || null,
              activo: true,
            });
          } else {
            const nuevoExtra = manager.create(ExtrasCatalogo, {
              empleadaId: id,
              nombre: ext.nombre,
              precio: Number(ext.precio),
              modelosVinculadasIds: ext.modelosVinculadasIds || [],
              speechPersonalizado: ext.speechPersonalizado || null,
              activo: true,
            });
            await manager.save(ExtrasCatalogo, nuevoExtra);
          }
        }
      }
    });

    return await this.findOne(id);
  }

  async getKpis(): Promise<
    Array<{
      id: string;
      nombreArtistico: string;
      fotoPerfilUrl: string | null;
      promedioCalificacion: number | null;
      totalServiciosValorados: number;
      confirmedReports90Days: number;
      revenue90Days: number;
      disponible: boolean;
      score: number | null;
      position: number | null;
    }>
  > {
    const employees = await this.empleadasRepository.find({
      select: {
        id: true,
        nombreArtistico: true,
        fotoPerfilUrl: true,
        promedioCalificacion: true,
        totalServiciosValorados: true,
        disponible: true,
      },
    });
    if (employees.length === 0) return [];
    const ids = employees.map((employee) => employee.id);

    const confirmedRows: Array<{ subject_id: string; confirmed: number }> =
      await this.dataSource.query(
        `SELECT subject_id, COUNT(*)::int AS confirmed
         FROM conduct_reports
         WHERE subject_type = 'employee' AND outcome = 'confirmado'
           AND created_at >= now() - interval '90 days'
           AND subject_id = ANY($1::uuid[])
         GROUP BY subject_id`,
        [ids],
      );
    const confirmedByEmployee = new Map(
      confirmedRows.map((row) => [row.subject_id, row.confirmed]),
    );

    const revenueRows: Array<{ empleada_id: string; revenue: string }> =
      await this.dataSource.query(
        `SELECT empleada_id, COALESCE(SUM(total_final), 0) AS revenue
         FROM servicios
         WHERE estado = 'finalizado' AND hora_fin_servicio >= now() - interval '90 days'
           AND empleada_id = ANY($1::uuid[])
         GROUP BY empleada_id`,
        [ids],
      );
    const revenueByEmployee = new Map(
      revenueRows.map((row) => [row.empleada_id, Number(row.revenue)]),
    );
    const maxRevenue = Math.max(0, ...revenueByEmployee.values());

    const kpis = employees.map((employee) => {
      const confirmedReports90Days = confirmedByEmployee.get(employee.id) ?? 0;
      const revenue90Days = revenueByEmployee.get(employee.id) ?? 0;
      const promedio = employee.promedioCalificacion;
      // El score combina calificación y reportes (como antes) con dos factores nuevos,
      // acotados a un bono pequeño para no desplazar el peso del desempeño con clientes:
      // ingresos generados (relativo a la mejor de sus pares en 90 días) y disponibilidad actual.
      let score: number | null = null;
      if (promedio != null) {
        const revenueBonus =
          maxRevenue > 0 ? Math.round((revenue90Days / maxRevenue) * 10) : 0;
        const availabilityBonus = employee.disponible ? 5 : 0;
        score = Math.max(
          0,
          Math.round((promedio / 5) * 100 - confirmedReports90Days * 8) +
            revenueBonus +
            availabilityBonus,
        );
      }
      return {
        id: employee.id,
        nombreArtistico: employee.nombreArtistico,
        fotoPerfilUrl: employee.fotoPerfilUrl,
        promedioCalificacion: promedio,
        totalServiciosValorados: employee.totalServiciosValorados,
        confirmedReports90Days,
        revenue90Days,
        disponible: employee.disponible,
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

  async remove(id: string): Promise<{ deleted: boolean }> {
    const empleada = await this.findOne(id);

    // 1. Eliminar foto principal de R2
    if (empleada.fotoPerfilUrl) {
      try {
        await this.uploadService.deleteFile(empleada.fotoPerfilUrl);
      } catch (err) {
        this.logger.error(
          'Error al eliminar fotoPerfilUrl de R2 en borrado:',
          err,
        );
      }
    }

    // 2. Eliminar fotos extras de R2
    if (empleada.empleadaFotos && empleada.empleadaFotos.length > 0) {
      for (const foto of empleada.empleadaFotos) {
        if (foto.url) {
          try {
            await this.uploadService.deleteFile(foto.url);
          } catch (err) {
            this.logger.error(
              'Error al eliminar foto extra de R2 en borrado:',
              err,
            );
          }
        }
      }
    }

    // Eliminar el usuario, lo cual cascada y borra el perfil y fotos en la base de datos
    await this.usuariosRepository.delete(empleada.usuarioId);
    return { deleted: true };
  }

  async getEmployeePortalData(identifier: string): Promise<EmployeePortalData> {
    const empleada = await this.empleadasRepository.findOne({
      where: [{ usuarioId: identifier }, { id: identifier }],
      relations: {
        usuario: true,
        empleadaFotos: true,
        fotosExclusivas: true,
      },
    });

    if (!empleada) {
      throw new NotFoundException('Perfil de empleada no encontrado');
    }

    const [withTrust] = await this.attachTrustScores([empleada]);
    const weeklyStatuses =
      await this.weeklyContentService.getWeeklyStatusForEmployees();
    const pendingCounts =
      await this.weeklyContentService.getPendingCountByEmployee();
    const weeklyContentStatus = weeklyStatuses[empleada.id] || 'al_dia';
    const pendingWeeklyPhotosCount = pendingCounts[empleada.id] || 0;

    // 1. Leaderboard / Ranking
    const allModels = await this.empleadasRepository.find({
      where: { catalogoActivo: true },
      relations: { usuario: true },
    });
    const allWithTrust = await this.attachTrustScores(allModels);

    const completedServicesCounts = await this.dataSource
      .getRepository(Servicios)
      .createQueryBuilder('s')
      .select('s.empleadaId', 'empleadaId')
      .addSelect('COUNT(s.id)', 'count')
      .where('s.estado = :estado', { estado: 'finalizado' })
      .groupBy('s.empleadaId')
      .getRawMany();

    const countsMap = new Map<string, number>();
    for (const row of completedServicesCounts) {
      countsMap.set(row.empleadaId, parseInt(row.count, 10) || 0);
    }

    const reportRows: Array<{ subject_id: string; confirmed: number }> =
      allWithTrust.length === 0
        ? []
        : await this.dataSource.query(
            `SELECT subject_id, COUNT(*)::int AS confirmed
             FROM conduct_reports
             WHERE subject_type = 'employee' AND outcome = 'confirmado'
               AND created_at >= now() - interval '90 days'
               AND subject_id = ANY($1::uuid[])
             GROUP BY subject_id`,
            [allWithTrust.map((m) => m.id)],
          );
    const reportsByEmployee = new Map(
      reportRows.map((row) => [row.subject_id, row.confirmed]),
    );

    const scored = allWithTrust.map((m) => {
      const sCount = countsMap.get(m.id) || 0;
      const rating = Number(
        m.clientRatingAverage || m.promedioCalificacion || 5.0,
      );
      const trust = Number(m.trustScore || 1.0);
      const confirmedReports = reportsByEmployee.get(m.id) ?? 0;
      const score =
        sCount * 10 + rating * 5 + trust * 20 - confirmedReports * 8;
      return {
        id: m.id,
        nombreArtistico: m.nombreArtistico,
        score,
      };
    });

    scored.sort((a, b) => b.score - a.score);

    let myPosition = 1;
    const leaderboard = scored.map((item, index) => {
      const isMe = item.id === empleada.id;
      if (isMe) myPosition = index + 1;
      return {
        position: index + 1,
        nombreArtistico: item.nombreArtistico,
        isMe,
      };
    });

    // 2. Services & Earnings calculation
    const services = await this.dataSource
      .getRepository(Servicios)
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.viajes', 'viajes')
      .leftJoinAndSelect('viajes.chofer', 'chofer')
      .leftJoinAndSelect('s.extrasServicios', 'extrasServicios')
      .where('s.empleadaId = :empleadaId', { empleadaId: empleada.id })
      .orderBy('s.horaInicioServicio', 'DESC')
      .getMany();

    const finishedServices = services.filter((s) => s.estado === 'finalizado');
    const now = new Date();

    const isSameDay = (d1: Date, d2: Date) => {
      return (
        d1.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' }) ===
        d2.toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City' })
      );
    };

    const isSameMonth = (d1: Date, d2: Date) => {
      const f1 = new Intl.DateTimeFormat('es-MX', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: 'numeric',
      }).format(d1);
      const f2 = new Intl.DateTimeFormat('es-MX', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: 'numeric',
      }).format(d2);
      return f1 === f2;
    };

    const isSameWeek = (d1: Date, d2: Date) => {
      const diffTime = Math.abs(d2.getTime() - d1.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays <= 7;
    };

    let todayNet = 0;
    let weekNet = 0;
    let monthNet = 0;
    let totalHistoricalNet = 0;

    let todayHours = 0;
    let weekHours = 0;
    let monthHours = 0;
    let totalHistoricalHours = 0;

    const mappedRecentServices: EmployeePortalServiceItem[] = [];
    const reviews: {
      id: string;
      fecha: string;
      estrellas: number;
      comentario: string;
    }[] = [];

    for (const s of finishedServices) {
      const duration = Number(
        s.duracionFinalHoras || s.duracionPactadaHoras || 1,
      );
      const baseHourly = Number(
        s.precioBaseHoraPactado || empleada.precioBaseHora || 2500,
      );
      const totalBase = Number(s.totalBase) || baseHourly * duration;
      const totalExtras = Number(s.totalExtras) || 0;

      // 60% estándar de la tarifa base para la empleada + 100% de extras
      const netShare = Math.round((totalBase * 0.6 + totalExtras) * 100) / 100;
      const sDate = s.horaFinServicio || s.horaInicioServicio || s.createdAt;

      totalHistoricalNet += netShare;
      totalHistoricalHours += duration;

      if (sDate) {
        const d = new Date(sDate);
        if (isSameDay(d, now)) {
          todayNet += netShare;
          todayHours += duration;
        }
        if (isSameWeek(d, now)) {
          weekNet += netShare;
          weekHours += duration;
        }
        if (isSameMonth(d, now)) {
          monthNet += netShare;
          monthHours += duration;
        }
      }

      // Reviews
      if (s.calificacion || s.comentariosCalificacion) {
        reviews.push({
          id: s.id,
          fecha: (sDate || now).toISOString(),
          estrellas: Number(s.calificacion || 5),
          comentario:
            s.comentariosCalificacion || 'Servicio calificado con 5 estrellas.',
        });
      }

      // Latest 20 services
      if (mappedRecentServices.length < 20) {
        const activeTrip = s.viajes?.[0];
        mappedRecentServices.push({
          id: s.id,
          fecha: (sDate || now).toISOString(),
          duracionHoras: duration,
          metodoPago: s.metodoPago,
          estado: s.estado,
          extrasTotal: totalExtras,
          gananciaNeta: netShare,
          calificacion: s.calificacion ? Number(s.calificacion) : null,
          comentarioCliente: s.comentariosCalificacion || null,
          transporteTipo: activeTrip?.tipo || null,
          transporteEstado: activeTrip?.estado || null,
        });
      }
    }

    // 3. Active / Next Service
    const activeOrUpcoming = services.find(
      (s) =>
        s.estado === 'en_curso' ||
        s.estado === 'agendado' ||
        s.estado === 'pendiente',
    );

    let activeServiceDto: EmployeePortalActiveService | null = null;
    if (activeOrUpcoming) {
      const duration = Number(activeOrUpcoming.duracionPactadaHoras || 1);
      const baseHourly = Number(
        activeOrUpcoming.precioBaseHoraPactado ||
          empleada.precioBaseHora ||
          2500,
      );
      const totalBase =
        Number(activeOrUpcoming.totalBase) || baseHourly * duration;
      const totalExtras = Number(activeOrUpcoming.totalExtras) || 0;
      const estimatedNet =
        Math.round((totalBase * 0.6 + totalExtras) * 100) / 100;

      const activeTrip = activeOrUpcoming.viajes?.[0];
      const startTime = activeOrUpcoming.horaInicioServicio
        ? new Date(activeOrUpcoming.horaInicioServicio)
        : null;
      const endTime = startTime
        ? new Date(startTime.getTime() + duration * 3600000)
        : null;

      activeServiceDto = {
        id: activeOrUpcoming.id,
        estado: activeOrUpcoming.estado,
        duracionHoras: duration,
        metodoPago: activeOrUpcoming.metodoPago,
        horaInicio: startTime?.toISOString() || null,
        horaFinEstimada: endTime?.toISOString() || null,
        gananciaEstimada: estimatedNet,
        transporte: activeTrip
          ? {
              tipo: activeTrip.tipo,
              proveedor: activeTrip.proveedorTransporte,
              estado: activeTrip.estado,
              choferNombre: activeTrip.chofer?.nombre || undefined,
            }
          : null,
      };
    }

    const publicPhotos = (empleada.empleadaFotos || [])
      .map((f) => f.url)
      .filter(Boolean);
    const privatePhotos = (empleada.fotosExclusivas || [])
      .map((f) => f.url)
      .filter(Boolean);

    // 4. Cash Delivery / Obligations
    const cashObligationEntities = await this.dataSource
      .getRepository(EmployeeCashObligation)
      .find({
        where: { employeeId: empleada.id, status: 'pending' },
        order: { createdAt: 'DESC' },
      });

    const obligations = cashObligationEntities.map((o) => {
      const amt = Number(o.amount) || 0;
      const paid = Number(o.paidAmount) || 0;
      const pending = Math.max(0, amt - paid);
      return {
        id: o.id,
        serviceId: o.serviceId,
        amount: amt,
        paidAmount: paid,
        pendingAmount: pending,
        calculationStatus: o.calculationStatus,
        pendingReason: o.pendingReason || null,
        customerTotal: Number(o.customerTotal) || 0,
        uberDeduction: Number(o.uberDeduction) || 0,
        serviceDate: o.serviceDate
          ? new Date(o.serviceDate).toISOString()
          : new Date().toISOString(),
        createdAt: o.createdAt
          ? new Date(o.createdAt).toISOString()
          : new Date().toISOString(),
      };
    });

    const totalCashPending = obligations.reduce(
      (sum, item) => sum + item.pendingAmount,
      0,
    );
    const hasProvisionalCash = obligations.some(
      (item) => item.calculationStatus === 'provisional',
    );

    const cashDelivery = {
      totalPending: Math.round(totalCashPending * 100) / 100,
      pendingServicesCount: obligations.length,
      hasProvisional: hasProvisionalCash,
      obligations,
    };

    return {
      profile: {
        id: empleada.id,
        nombreArtistico: empleada.nombreArtistico,
        fotoPerfilUrl: empleada.fotoPerfilUrl,
        precioBaseHora: Number(empleada.precioBaseHora),
        disponible: empleada.disponible,
        catalogoActivo: empleada.catalogoActivo,
        availabilityStatus:
          empleada.availabilityStatus ||
          (empleada.disponible ? 'disponible' : 'inactiva'),
        weeklyContentStatus,
        pendingWeeklyPhotosCount,
        publicPhotosCount: publicPhotos.length,
        privatePhotosCount: privatePhotos.length,
        publicPhotos,
        privatePhotos,
      },
      ranking: {
        myPosition,
        totalModels: leaderboard.length,
        leaderboard,
      },
      earnings: {
        todayNet: Math.round(todayNet * 100) / 100,
        weekNet: Math.round(weekNet * 100) / 100,
        monthNet: Math.round(monthNet * 100) / 100,
        totalHistoricalNet: Math.round(totalHistoricalNet * 100) / 100,
        todayHours,
        weekHours,
        monthHours,
        totalHistoricalHours,
        percentageRate: 60,
      },
      cashDelivery,
      activeService: activeServiceDto,
      recentServices: mappedRecentServices,
      reputation: {
        ratingAverage: Number(
          empleada.clientRatingAverage || empleada.promedioCalificacion || 5.0,
        ),
        ratingCount: Number(
          empleada.clientRatingCount || empleada.totalServiciosValorados || 0,
        ),
        trustScore: Number(withTrust?.trustScore || 1.0),
        reviews: reviews.slice(0, 15),
      },
    };
  }
}
