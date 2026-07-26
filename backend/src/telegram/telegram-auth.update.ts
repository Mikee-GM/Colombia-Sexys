import { Inject, forwardRef, Logger } from '@nestjs/common';
import {
  Update,
  Start,
  Help,
  Ctx,
  Action,
  Command,
  Hears,
} from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, MoreThan } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
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
    @Inject(forwardRef(() => TelegramService))
    private readonly telegramService: TelegramService,
    @Inject(forwardRef(() => TelegramBookingUpdate))
    private readonly telegramBookingUpdate: TelegramBookingUpdate,
    private readonly telegramOnboardingService: TelegramOnboardingService,
    private readonly groupServicesService: GroupServicesService,
  ) {}

  @Start()
  @Command('contactar')
  async onStart(@Ctx() ctx: Context) {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

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
      await this.telegramBookingUpdate.startDirectGroupSession(ctx as any);
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

  @Help()
  async onHelp(@Ctx() ctx: Context) {
    await ctx.reply(
      'Comandos disponibles:\n' +
        '/contactar - Iniciar interacción con el bot\n' +
        '/vincular <código> - Vincular cuenta de empleado o chofer\n' +
        '/desvincular - Desvincular tu cuenta de empleado o chofer\n' +
        '/vincular_grupo - Vincular el grupo de Telegram actual a tu cuenta (Jefes y Admins)\n' +
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
    inlineButtons.push(
      [
        Markup.button.callback(
          '➕ Agregar Extra',
          `agregar_extra_list:${service.id}`,
        ),
      ],
    );

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

  private employeeMenu() {
    return Markup.keyboard([
      ['📋 Servicios de hoy', '🟢 Servicio activo'],
      ['🚗 Estatus del chofer'],
    ]).resize();
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
}
