import { Inject, forwardRef, Logger } from '@nestjs/common';
import {
  Update,
  Start,
  Help,
  Ctx,
  Action,
  Command,
  Hears,
  On,
} from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, MoreThan } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth/auth.service';
import { Usuarios } from '../users/entities/user.entity';
import { Clientes } from '../clients/entities/client.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { Servicios } from '../services/entities/service.entity';
import { Viajes } from '../trips/entities/trip.entity';
import { TelegramService } from './telegram.service';
import { TelegramBookingUpdate } from './telegram-booking.update';
import { TelegramOnboardingService } from './telegram-onboarding.service';
import { GroupServicesService } from '../group-services/group-services.service';
import { parseTelegramStartPayload } from './telegram-start-payload';
import { UploadService } from '../upload/upload.service';
import { WeeklyContentService } from '../weekly-content/weekly-content.service';
import { CandidateScreeningService } from '../candidate-screening/candidate-screening.service';
import { DisciplineService } from '../discipline/discipline.service';

@Update()
export class TelegramAuthUpdate {
  private readonly logger = new Logger(TelegramAuthUpdate.name);

  constructor(
    @InjectRepository(Usuarios)
    private readonly usuariosRepository: Repository<Usuarios>,
    @InjectRepository(Clientes)
    private readonly clientesRepository: Repository<Clientes>,
    @InjectRepository(Empleadas)
    private readonly empleadasRepository: Repository<Empleadas>,
    @InjectRepository(Servicios)
    private readonly serviciosRepository: Repository<Servicios>,
    @InjectRepository(Viajes)
    private readonly viajesRepository: Repository<Viajes>,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegramService: TelegramService,
    @Inject(forwardRef(() => TelegramBookingUpdate))
    private readonly telegramBookingUpdate: TelegramBookingUpdate,
    private readonly telegramOnboardingService: TelegramOnboardingService,
    private readonly groupServicesService: GroupServicesService,
    private readonly uploadService: UploadService,
    @Inject(forwardRef(() => WeeklyContentService))
    private readonly weeklyContentService: WeeklyContentService,
    private readonly candidateScreeningService: CandidateScreeningService,
    private readonly disciplineService: DisciplineService,
  ) {}

  @Start()
  @Command('contactar')
  async onStart(@Ctx() ctx: Context) {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const startText = (ctx.message as any)?.text || '';
    const earlyPayload = parseTelegramStartPayload(startText);
    if (earlyPayload.type === 'candidate_screening') {
      await this.onCandidateScreeningStart(ctx, telegramId, earlyPayload.token);
      return;
    }

    // Check if the user is a registered system user (employee, admin, etc.)
    const user = await this.usuariosRepository.findOne({
      where: { telegramChatId: telegramId },
    });

    // Otherwise, check/register client
    let client: Clientes | null = null;
    if (!user) {
      client = await this.clientesRepository.findOne({
        where: { telegramChatId: telegramId },
      });

      if (!client) {
        const firstName = ctx.from?.first_name || '';
        const username = ctx.from?.username || '';
        const fullName =
          [firstName, ctx.from?.last_name].filter(Boolean).join(' ') ||
          username ||
          'Cliente';

        // Auto-register client
        client = this.clientesRepository.create({
          telegramChatId: telegramId,
          nombreTelegram: fullName,
        });
        await this.clientesRepository.save(client);
      }
    }

    const text = (ctx.message as any)?.text || '';
    const startPayload = parseTelegramStartPayload(text);
    if (startPayload.type === 'group_service' && !user && client) {
      await this.telegramBookingUpdate.startDirectGroupSession(ctx);
      return;
    }
    if (startPayload.type === 'employee_hire') {
      await this.telegramBookingUpdate.startHireSession(
        ctx,
        startPayload.employeeId,
      );
      return;
    }

    if (user) {
      let liveLocationReminder = '';
      if (user.rol === 'chofer' || user.rol === 'empleada') {
        liveLocationReminder = `\n\n📍 *Recordatorio:* Recuerda compartir tu *Ubicación en tiempo real* (Live Location) usando el botón de adjuntar (📎 -> Ubicación -> Compartir ubicación en tiempo real por 8h). NO envíes ubicación estática.`;
      }
      await ctx.reply(
        `¡Hola de nuevo! Estás autenticado como ${user.email} (Rol: ${user.rol.toUpperCase()}).\n` +
          `¿Qué deseas hacer hoy?${liveLocationReminder}`,
        {
          parse_mode: 'Markdown',
          ...(user.rol === 'empleada'
            ? this.employeeMenu()
            : user.rol === 'chofer'
              ? this.driverMenu()
              : {}),
        },
      );
      return;
    }

    const fullName = client?.nombreTelegram || 'Cliente';
    const webUrl = process.env.WEB_URL || 'https://tu-sitio-pasteleria.com';
    await ctx.reply(
      `¡Hola ${fullName}! Bienvenido.\n` +
        `Para contratar a una de nuestras empleadas y comenzar tu servicio, por favor utiliza el enlace de contratación directa en nuestra web.\n\n` +
        `🌐 *Visita nuestra web:* ${webUrl}`,
      {
        parse_mode: 'Markdown',
      },
    );
  }

  private async onCandidateScreeningStart(
    ctx: Context,
    telegramId: string,
    token: string,
  ) {
    const screening =
      await this.candidateScreeningService.getScreeningByToken(token);
    if (!screening) {
      await ctx.reply('Este enlace de evaluación no es válido o ya expiró.');
      return;
    }
    if (screening.status === 'completado') {
      await ctx.reply(
        `¡Hola ${screening.candidateName}! Ya registramos tus respuestas anteriormente. ` +
          `Gracias por tu tiempo, en breve nos pondremos en contacto contigo.`,
      );
      return;
    }
    await this.candidateScreeningService.bindTelegram(screening.id, telegramId);
    await ctx.reply(
      `¡Hola ${screening.candidateName}! 👋\n\n` +
        `Vamos a hacerte algunas preguntas para conocerte un poco más. Responde cada una con un mensaje de texto.`,
    );
    await this.sendNextCandidateQuestion(ctx, screening.id);
  }

  private async sendNextCandidateQuestion(ctx: Context, screeningId: string) {
    const next =
      await this.candidateScreeningService.getNextQuestion(screeningId);
    if (!next) return;
    const session = ((ctx as any).session ??= {});
    session.step = 'AWAITING_CANDIDATE_ANSWER';
    session.candidateScreeningId = screeningId;
    await ctx.reply(
      `Pregunta ${next.index}/${next.total}:\n${next.question.text}`,
    );
  }

  @On('text')
  async onCandidateScreeningAnswer(@Ctx() ctx: Context) {
    const session = (ctx as any).session;
    if (
      session?.step !== 'AWAITING_CANDIDATE_ANSWER' ||
      !session.candidateScreeningId
    ) {
      return;
    }
    const text = ((ctx.message as { text?: string })?.text || '').trim();
    if (!text || text.startsWith('/')) return;
    if (text.length < 2 || text.length > 4000) {
      await ctx.reply('Tu respuesta debe tener entre 2 y 4000 caracteres.');
      return;
    }

    const result = await this.candidateScreeningService.submitAnswer(
      session.candidateScreeningId,
      text,
    );
    if (result.completed) {
      session.step = undefined;
      session.candidateScreeningId = undefined;
      await ctx.reply(
        '¡Gracias por tus respuestas! Las enviamos a administración, en breve te contactaremos.',
      );
      return;
    }
    await ctx.reply(
      `Pregunta ${result.question.index}/${result.question.total}:\n${result.question.question.text}`,
    );
  }

  private async resolveAppealIdentity(
    telegramId: string,
  ): Promise<{ type: 'client' | 'employee' | 'driver'; id: string } | null> {
    const user = await this.usuariosRepository.findOne({
      where: { telegramChatId: telegramId },
      relations: { empleadas: true, choferes: true },
    });
    if (user?.empleadas) return { type: 'employee', id: user.empleadas.id };
    if (user?.choferes) return { type: 'driver', id: user.choferes.id };
    if (!user) {
      const client = await this.clientesRepository.findOne({
        where: { telegramChatId: telegramId },
      });
      if (client) return { type: 'client', id: client.id };
    }
    return null;
  }

  @Command('apelar')
  async onAppealCommand(@Ctx() ctx: Context) {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const identity = await this.resolveAppealIdentity(telegramId);
    if (!identity) {
      await ctx.reply(
        'No encontramos tu perfil para apelar calificaciones. Si eres cliente, primero debes tener al menos un servicio finalizado.',
      );
      return;
    }

    const ratings = await this.disciplineService.listOwnAppealableRatings(
      identity.type,
      identity.id,
    );
    if (!ratings.length) {
      await ctx.reply(
        'No tienes calificaciones recientes de 3 estrellas o menos que puedas apelar.',
      );
      return;
    }

    const buttons = ratings.map((rating: any) => [
      Markup.button.callback(
        `${'★'.repeat(rating.stars)}${'☆'.repeat(5 - rating.stars)} — ${new Date(rating.createdAt).toLocaleDateString('es-MX')}`,
        `appeal_select:${rating.id}`,
      ),
    ]);
    await ctx.reply(
      '¿Cuál calificación quieres apelar?',
      Markup.inlineKeyboard(buttons),
    );
  }

  @Action(/^appeal_select:(.+)$/)
  async onAppealSelect(@Ctx() ctx: Context) {
    const match = (ctx as any).match;
    const ratingId = match?.[1];
    if (!ratingId) return;
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;
    const identity = await this.resolveAppealIdentity(telegramId);
    if (!identity) return;

    const session = ((ctx as any).session ??= {});
    session.step = 'AWAITING_APPEAL_REASON';
    session.appealRatingId = ratingId;
    session.appealSubjectType = identity.type;
    session.appealSubjectId = identity.id;
    await ctx.reply(
      'Cuéntanos brevemente por qué crees que esta calificación no es justa. Escribe tu explicación:',
    );
  }

  @On('text')
  async onAppealReasonText(@Ctx() ctx: Context) {
    const session = (ctx as any).session;
    if (
      session?.step !== 'AWAITING_APPEAL_REASON' ||
      !session.appealRatingId ||
      !session.appealSubjectType ||
      !session.appealSubjectId
    ) {
      return;
    }
    const text = ((ctx.message as { text?: string })?.text || '').trim();
    if (!text || text.startsWith('/')) return;
    if (text.length < 5 || text.length > 2000) {
      await ctx.reply('Tu explicación debe tener entre 5 y 2000 caracteres.');
      return;
    }
    try {
      await this.disciplineService.appealRating(
        session.appealSubjectType,
        session.appealSubjectId,
        session.appealRatingId,
        text,
      );
      await ctx.reply(
        'Tu apelación quedó registrada. Mientras se revisa, esa calificación no contará en tu promedio. Te avisaremos cuando haya una resolución.',
      );
    } catch (error: any) {
      await ctx.reply(
        error?.message || 'No fue posible registrar tu apelación.',
      );
    } finally {
      session.step = undefined;
      session.appealRatingId = undefined;
      session.appealSubjectType = undefined;
      session.appealSubjectId = undefined;
    }
  }

  @Help()
  async onHelp(@Ctx() ctx: Context) {
    await ctx.reply(
      'Comandos disponibles:\n' +
        '/contactar - Iniciar interacción con el bot\n' +
        '/vincular <código> - Vincular cuenta de empleado o chofer\n' +
        '/desvincular - Desvincular tu cuenta de empleado o chofer\n' +
        '/vincular_grupo - Vincular el grupo de Telegram actual a tu cuenta (Jefes y Admins)\n' +
        '/apelar - Apelar una calificación que recibiste\n' +
        '/help - Ver los comandos de ayuda',
    );
  }

  @Command('vincular')
  async onVincular(@Ctx() ctx: Context) {
    const messageText = (ctx.message as { text?: string })?.text || '';
    const parts = messageText.split(' ');
    if (parts.length < 2) {
      await ctx.reply(
        'Por favor proporciona el código de vinculación.\n' +
          'Uso: /vincular <código_de_6_dígitos>',
      );
      return;
    }

    const code = parts[1].trim();
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    // Find the user with the active, non-expired OTP code
    const user = await this.usuariosRepository.findOne({
      where: {
        telegramVerificationCode: code,
        telegramVerificationExpiresAt: MoreThan(new Date()),
      },
    });

    if (!user) {
      await ctx.reply(
        'El código de vinculación no es válido o ha expirado. ' +
          'Por favor solicita un nuevo código en el panel.',
      );
      return;
    }

    // Check if this telegramId is already linked to another user
    const existingUser = await this.usuariosRepository.findOne({
      where: { telegramChatId: telegramId },
    });

    if (existingUser) {
      await ctx.reply(
        `Este Telegram ya se encuentra vinculado a la cuenta ${existingUser.email}. ` +
          `No se puede vincular a otra cuenta.`,
      );
      return;
    }

    // Link account
    user.telegramChatId = telegramId;
    user.telegramVerificationCode = null;
    user.telegramVerificationExpiresAt = null;
    await this.usuariosRepository.save(user);

    await ctx.reply(
      `🎉 ¡Vinculación exitosa!\n` +
        `Tu cuenta con correo ${user.email} (Rol: ${user.rol.toUpperCase()}) ahora está vinculada a este Telegram.`,
    );

    if (['empleada', 'chofer', 'jefe'].includes(user.rol)) {
      await this.telegramOnboardingService.handleStaffLinked(user.id);
    }
  }

  @Hears('📋 Servicios de hoy')
  async onEmployeeServicesToday(@Ctx() ctx: Context) {
    const employee = await this.getEmployeeFromContext(ctx);
    if (!employee) return;

    const services = await this.serviciosRepository
      .createQueryBuilder('servicio')
      .leftJoinAndSelect('servicio.cliente', 'cliente')
      .where('servicio.empleadaId = :employeeId', { employeeId: employee.id })
      .andWhere('servicio.estado = :status', { status: 'finalizado' })
      .andWhere(
        `(servicio.horaFinServicio AT TIME ZONE 'America/Mexico_City')::date = ` +
          `(CURRENT_TIMESTAMP AT TIME ZONE 'America/Mexico_City')::date`,
      )
      .orderBy('servicio.horaFinServicio', 'DESC')
      .getMany();

    if (services.length === 0) {
      await ctx.reply('Hoy todavía no tienes servicios finalizados.');
      return;
    }

    const lines = services.map(
      (service, index) =>
        `${index + 1}. ${this.formatTime(service.horaInicioServicio)}–${this.formatTime(service.horaFinServicio)}` +
        ` · ${service.cliente?.nombreTelegram || 'Cliente'} · $${Number(service.totalFinal).toFixed(2)}`,
    );
    await ctx.reply(
      `📋 Servicios finalizados hoy: ${services.length}\n\n${lines.join('\n')}`,
    );
  }

  @Hears('🟢 Servicio activo')
  async onEmployeeActiveService(@Ctx() ctx: Context) {
    const employee = await this.getEmployeeFromContext(ctx);
    if (!employee) return;

    let service = await this.serviciosRepository.findOne({
      where: { empleadaId: employee.id, estado: 'en_curso' },
      relations: { cliente: true },
      order: { horaInicioServicio: 'DESC' },
    });
    if (!service) {
      service = await this.serviciosRepository.findOne({
        where: {
          estado: 'en_curso',
          serviceType: 'grupal',
          participantes: { employeeId: employee.id, status: 'activa' },
        },
        relations: { cliente: true, participantes: true },
        order: { horaInicioServicio: 'DESC' },
      });
    }

    if (!service) {
      await ctx.reply('No tienes un servicio activo en este momento.');
      return;
    }

    const access =
      service.serviceType === 'grupal'
        ? await this.groupServicesService.participantAccess(
            service.id,
            ctx.from!.id.toString(),
          )
        : null;
    const responsible =
      service.serviceType !== 'grupal' || Boolean(access?.responsible);
    const uberTrips = responsible
      ? await this.viajesRepository.find({
          where: { servicioId: service.id, proveedorTransporte: 'uber' },
          order: { horaNotificacion: 'DESC' },
        })
      : [];
    const actionableUberTrip = uberTrips.find((trip) =>
      ['llegado', 'en_curso'].includes(trip.estado),
    );
    const inlineButtons: any[][] = [];

    if (actionableUberTrip?.estado === 'llegado') {
      inlineButtons.push([
        Markup.button.callback(
          '🚗 Ya estoy en el Uber',
          `eu:${actionableUberTrip.id}:i`,
        ),
      ]);
    } else if (actionableUberTrip?.estado === 'en_curso') {
      inlineButtons.push([
        Markup.button.callback('📍 Ya llegué', `eu:${actionableUberTrip.id}:f`),
      ]);
    }

    if (responsible) {
      inlineButtons.push([
        Markup.button.callback(
          '🏁 Finalizar Servicio',
          `finalizar_servicio:${service.id}`,
        ),
      ]);
    }
    inlineButtons.push([
      Markup.button.callback(
        '➕ Agregar Extra',
        `agregar_extra_list:${service.id}`,
      ),
    ]);

    await ctx.reply(
      `🟢 Servicio activo\n\n` +
        `Cliente: ${service.cliente?.nombreTelegram || 'Cliente'}\n` +
        `Inicio: ${this.formatTime(service.horaInicioServicio)}\n` +
        `Duración pactada: ${Number(service.duracionPactadaHoras)} h\n` +
        (responsible
          ? `Rol: responsable\nTotal actual: $${Number(service.totalFinal).toFixed(2)}`
          : `Rol: participante\nSolo puedes registrar extras propios.`),
      Markup.inlineKeyboard(inlineButtons),
    );
  }

  @Hears('🚗 Estatus del chofer')
  async onEmployeeDriverStatus(@Ctx() ctx: Context) {
    const employee = await this.getEmployeeFromContext(ctx);
    if (!employee) return;

    let service = await this.serviciosRepository.findOne({
      where: [
        { empleadaId: employee.id, estado: 'en_curso' },
        { empleadaId: employee.id, estado: 'pendiente' },
      ],
      order: { createdAt: 'DESC' },
    });
    if (!service) {
      service = await this.serviciosRepository.findOne({
        where: {
          serviceType: 'grupal',
          estado: In(['pendiente', 'en_curso']),
          participantes: {
            employeeId: employee.id,
            status: In(['reservada', 'pendiente_pago', 'activa']),
          },
        },
        relations: { participantes: true },
        order: { createdAt: 'DESC' },
      });
    }
    if (!service) {
      await ctx.reply('No tienes un servicio vigente con transporte.');
      return;
    }
    if (service.serviceType === 'grupal') {
      const access = await this.groupServicesService.participantAccess(
        service.id,
        ctx.from!.id.toString(),
      );
      if (!access?.responsible) {
        await ctx.reply(
          'El estado de transporte está disponible únicamente para la responsable del servicio grupal.',
        );
        return;
      }
    }

    const trips = await this.viajesRepository.find({
      where: { servicioId: service.id },
      relations: { chofer: true },
      order: { horaNotificacion: 'DESC' },
    });
    if (trips.length === 0) {
      await ctx.reply('Aún no se ha solicitado un chofer para tu servicio.');
      return;
    }

    const labels: Record<string, string> = {
      notificado: 'Buscando confirmación',
      aceptado: 'Chofer asignado',
      llegado: 'El chofer ya llegó',
      en_curso: 'Viaje en curso',
      finalizado: 'Viaje finalizado',
      rechazado: 'Oferta rechazada',
      cancelado: 'Viaje cancelado',
    };
    const lines = trips.map((trip) => {
      const driver = trip.chofer?.nombre
        ? ` · ${trip.chofer.nombre}${trip.chofer.telefono ? ` (${trip.chofer.telefono})` : ''}`
        : '';
      const provider = trip.proveedorTransporte === 'uber' ? 'Uber' : 'Chofer';
      return `${trip.tipo === 'ida' ? 'Ida' : 'Regreso'}: ${provider} · ${labels[trip.estado] || trip.estado}${driver}`;
    });
    await ctx.reply(`🚗 Estatus de transporte\n\n${lines.join('\n')}`);
  }

  @Hears(['👑 Mi Portal', '/portal'])
  @Command('portal')
  async onEmployeePortal(@Ctx() ctx: Context) {
    const employee = await this.getEmployeeFromContext(ctx);
    if (!employee || !employee.usuario) return;

    const token = await this.authService.generatePortalToken(employee.usuario);
    const baseUrl =
      process.env.WEB_URL ||
      process.env.FRONTEND_URL ||
      'https://colombia-sexys.com';
    const portalUrl = `${baseUrl.replace(/\/$/, '')}/empleada/portal?token=${encodeURIComponent(token)}`;

    await ctx.reply(
      `👑 *¡Hola, ${employee.nombreArtistico}! Tu Portal Exclusivo*\n\n` +
        `Accede a tu panel para consultar:\n` +
        `🏆 Tu posición en el *Ranking Global*\n` +
        `💵 Tus *Ganancias Netas* y horas acumuladas\n` +
        `📋 Tu historial de *Servicios* y estatus de transporte\n` +
        `⭐ Tus *Calificaciones* y comentarios de clientes\n\n` +
        `_Haz clic en el botón de abajo para abrir la Mini App de forma segura:_`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.webApp('✨ Abrir Mi Portal', portalUrl)],
          [Markup.button.url('🌐 Abrir en el navegador', portalUrl)],
        ]),
      },
    );
  }

  private employeeMenu() {
    return Markup.keyboard([['👑 Mi Portal']]).resize();
  }

  private driverMenu() {
    return Markup.keyboard([
      ['🟢 Quedar Disponible', '🔴 Quedar Inactivo'],
    ]).resize();
  }

  private async getEmployeeFromContext(
    ctx: Context,
  ): Promise<Empleadas | null> {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return null;

    const employee = await this.empleadasRepository.findOne({
      where: { usuario: { telegramChatId: telegramId, rol: 'empleada' } },
      relations: { usuario: true },
    });
    if (!employee) {
      await ctx.reply(
        'Esta opción solo está disponible para empleadas con una cuenta vinculada.',
      );
    }
    return employee;
  }

  private formatTime(date: Date | null): string {
    if (!date) return 'Sin registrar';
    return new Intl.DateTimeFormat('es-MX', {
      timeZone: 'America/Mexico_City',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  }

  @Command('desvincular')
  async onDesvincular(@Ctx() ctx: Context) {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const user = await this.usuariosRepository.findOne({
      where: { telegramChatId: telegramId },
    });

    if (!user) {
      await ctx.reply(
        'No tienes ninguna cuenta de personal vinculada a este Telegram.',
      );
      return;
    }

    user.telegramChatId = null;
    user.telegramVerificationCode = null;
    user.telegramVerificationExpiresAt = null;
    await this.usuariosRepository.save(user);

    await ctx.reply(
      `Tu cuenta (${user.email}) ha sido desvinculada exitosamente de este Telegram.`,
    );
  }

  @Command('vincular_grupo')
  async onVincularGrupo(@Ctx() ctx: Context) {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const user = await this.usuariosRepository.findOne({
      where: { telegramChatId: telegramId },
    });

    if (!user) {
      await ctx.reply(
        '❌ No estás registrado o vinculado en el sistema. Vincula tu cuenta personal primero con /vincular <codigo> en el chat privado.',
      );
      return;
    }

    // Permitir jefe o admin
    const isAllowed = user.rol === 'jefe' || user.rol === 'admin';

    if (!isAllowed) {
      await ctx.reply(
        '❌ Solo los Jefes o Administradores pueden vincular grupos.',
      );
      return;
    }

    const chatType = ctx.chat?.type;
    const chatId = ctx.chat?.id.toString();
    if (!chatId || (chatType !== 'group' && chatType !== 'supergroup')) {
      await ctx.reply(
        '❌ Este comando debe ejecutarse dentro del grupo de Telegram que deseas vincular.',
      );
      return;
    }

    user.grupoTelegramId = chatId;
    await this.usuariosRepository.save(user);

    await ctx.reply(
      `✅ ¡Grupo vinculado con éxito! ID del grupo registrado: ${chatId} para el usuario ${user.email}`,
    );
  }

  @Command('panel')
  async onPanel(@Ctx() ctx: Context) {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const user = await this.usuariosRepository.findOne({
      where: { telegramChatId: telegramId },
    });

    if (!user || (user.rol !== 'jefe' && user.rol !== 'admin')) {
      await ctx.reply(
        '❌ No tienes permisos de Jefe o Administrador para acceder al panel.',
      );
      return;
    }

    const payload = { sub: user.id, email: user.email, rol: user.rol };
    const token = this.jwtService.sign(payload);

    await ctx.reply(
      `🔑 *Token de Acceso Jefes:*\n\n` +
        `\`${token}\`\n\n` +
        `Usa este token para autenticar tu panel externo conectándote al flujo de Server-Sent Events (SSE).`,
      { parse_mode: 'Markdown' },
    );
  }

  @On('photo')
  async onPhotoMessage(@Ctx() ctx: Context) {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const user = await this.usuariosRepository.findOne({
      where: { telegramChatId: telegramId },
    });

    // Si es una empleada enviando fotos, procesarla para su contenido semanal
    if (user && user.rol === 'empleada') {
      const empleada = await this.empleadasRepository.findOne({
        where: { usuarioId: user.id },
      });
      if (!empleada) return;

      const photos = (ctx.message as any)?.photo;
      if (!photos || photos.length === 0) return;

      // Obtener la foto con mayor resolución (último elemento del arreglo)
      const bestPhoto = photos[photos.length - 1];
      const fileId = bestPhoto.file_id;

      try {
        const fileLink = await ctx.telegram.getFileLink(fileId);
        const uploadResult = await this.uploadService.uploadEvidenceFromUrl({
          sourceUrl: fileLink.href,
          folder: 'transferencias', // o carpeta de contenido
          scopeId: empleada.id,
        });

        await this.weeklyContentService.recordTelegramPhotoSubmission(
          empleada.id,
          uploadResult.url,
        );

        await ctx.reply(
          `📸 *¡Foto recibida con éxito!*\n\n` +
            `Tu foto ha sido enviada al panel administrativo para ser validada e incorporada a tu catálogo. ¡Gracias por mantener tu contenido actualizado! ✨`,
          { parse_mode: 'Markdown' },
        );
      } catch (err) {
        this.logger.error('Error al procesar foto semanal de empleada:', err);
        await ctx.reply(
          `⚠️ Ocurrió un inconveniente al guardar tu foto. Por favor intenta enviarla de nuevo.`,
        );
      }
    }
  }
}
