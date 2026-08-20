import {
  ConflictException,
  ForbiddenException,
  Inject,
  forwardRef,
  Logger,
  BeforeApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Update, Ctx, Action, On, Hears } from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { RealtimeEventsService } from '../realtime/realtime.service';
import { Usuarios } from '../users/entities/user.entity';
import { Clientes } from '../clients/entities/client.entity';
import { Empleadas } from '../employees/entities/employee.entity';
import { AuthorizedBankAccounts } from '../services/entities/authorized-bank-account.entity';
import { PaymentReceiptValidations } from '../services/entities/payment-receipt-validation.entity';
import { Choferes } from '../drivers/entities/driver.entity';
import { Servicios } from '../services/entities/service.entity';
import { Viajes } from '../trips/entities/trip.entity';
import { ServicesService } from '../services/services.service';
import { TelegramService } from './telegram.service';
import { TelegramAuthUpdate } from './telegram-auth.update';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { ExtrasCatalogo } from '../catalog-extras/entities/catalog-extra.entity';
import { ExtrasServicio } from '../service-extras/entities/service-extra.entity';
import { TelegramBookingService } from './telegram-booking.service';
import {
  getHireSystemPrompt,
  getGeneralChatSystemPrompt,
  getSentimentPrompt,
} from '../ai/prompts/prompts';
import { clientMessages } from './client-messages';
import { AiMessageService } from '../ai/ai-message.service';
import { ConversacionesTelegram } from '../telegram-conversations/entities/telegram-conversation.entity';
import { EmployeeReportsService } from '../employee-reports/employee-reports.service';
import { ReportCategory } from '../employee-reports/entities/employee-report.entity';
import {
  buildReportCategoryCallback,
  parseReportCategoryCode,
} from '../employee-reports/report-callback';
import { ExtensionsService } from '../extensions/extensions.service';
import { TransportOperationsService } from '../transport-operations/transport-operations.service';
import { randomUUID } from 'crypto';
import { DisciplineService } from '../discipline/discipline.service';
import { GroupServicesService } from '../group-services/group-services.service';
import { UploadService } from '../upload/upload.service';

interface SessionData {
  step?:
    | 'AWAITING_DURATION'
    | 'AWAITING_LOCATION'
    | 'AWAITING_PAYMENT_METHOD'
    | 'AWAITING_MIXED_TRANSFER_AMOUNT'
    | 'AWAITING_PAYMENT_RECEIPT'
    | 'AWAITING_RATING_COMMENT'
    | 'AWAITING_EMPLOYEE_DRIVER_RATING_COMMENT'
    | 'AWAITING_EMPLOYEE_CONDUCT_DESCRIPTION'
    | 'AWAITING_CLIENT_REPORT_DESCRIPTION'
    | 'AWAITING_UBER_FARE_ACTION'
    | 'AWAITING_UBER_FARE'
    | 'AWAITING_UBER_SCREENSHOT'
    | 'CHAT_CON_EMPLEADA'
    | 'GROUP_WITH_BOSS'
    | 'AWAITING_CANDIDATE_ANSWER'
    | 'AWAITING_APPEAL_REASON';
  empleadaId?: string;
  duracionPactadaHoras?: number;
  metodoPago?: 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto';
  mixedTransferAmount?: number;
  locationLat?: string;
  locationLng?: string;
  locationNotas?: string | null;
  servicioIdCalificacion?: string;
  pendingRating?: number;
  groupRatingEmployeeId?: string;
  disciplineTripId?: string;
  disciplineServiceId?: string;
  disciplineStars?: number;
  disciplineDirection?: 'employee_to_driver' | 'employee_to_client';
  reportServiceId?: string;
  reportCategory?: ReportCategory;
  reportDescription?: string;
  uberTripId?: string;
  pendingUberFare?: number;
  presetLocationId?: string;
  locationNameSnapshot?: string;
  locationAddressSnapshot?: string;
  customerTransportCharge?: number;
  chatHistory?: { role: 'user' | 'model'; parts: { text: string }[] }[];
  bookingSessionId?: string;
  selectedEmployeeBusy?: boolean;
  waitingForBusyChoice?: boolean;
  groupIntentClarificationPending?: boolean;
  groupRequestId?: string;
  extraSelection?: {
    servicioId: string;
    extraId: string;
    participantId?: string;
  };
  candidateScreeningId?: string;
  appealRatingId?: string;
  appealSubjectType?: 'client' | 'employee' | 'driver';
  appealSubjectId?: string;
}

interface BotContext extends Context {
  session?: SessionData;
}

export function isUberAdminInputSession(session?: { step?: string }): boolean {
  return (
    session?.step === 'AWAITING_UBER_FARE_ACTION' ||
    session?.step === 'AWAITING_UBER_FARE' ||
    session?.step === 'AWAITING_UBER_SCREENSHOT'
  );
}

export function parseUberFareInput(text: string): number | undefined {
  const normalized = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

export function parseReceiptAmount(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
  if (typeof value !== 'string') return undefined;
  let normalized = value.replace(/[^\d.,-]/g, '').trim();
  if (!normalized) return undefined;
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  if (lastComma > lastDot) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = normalized.replace(/,/g, '');
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

function normalizedDigits(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

function normalizedName(value: unknown): string {
  return typeof value === 'string'
    ? value
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
    : '';
}

export function validateReceiptAnalysis(
  analysis: any,
  expectedAmount: number,
  accounts: AuthorizedBankAccounts[],
): {
  valid: boolean;
  amount?: number;
  reason?: string;
  needsManualReview?: boolean;
} {
  if (analysis?.aiCallFailed === true) {
    return {
      valid: false,
      needsManualReview: true,
      reason:
        'No fue posible verificar automáticamente el comprobante; un asesor lo revisará en breve.',
    };
  }
  const isReceipt = Boolean(analysis?.valid ?? analysis?.esComprobante);
  if (!isReceipt) {
    return {
      valid: false,
      reason: 'La imagen no fue reconocida como comprobante bancario.',
    };
  }
  if (analysis?.analisisIA?.posibleFraude === true) {
    return {
      valid: false,
      reason:
        analysis.analisisIA.alertas?.join(', ') ||
        'El comprobante presenta señales de posible edición.',
    };
  }
  if (analysis?.estadoVisual?.textoLegible === false) {
    return {
      valid: false,
      reason: 'El texto del comprobante no es suficientemente legible.',
    };
  }

  const amount = parseReceiptAmount(analysis?.amount ?? analysis?.monto);
  if (!amount) {
    return { valid: false, reason: 'No se pudo leer el monto transferido.' };
  }
  if (amount + 0.009 < expectedAmount) {
    return {
      valid: false,
      amount,
      reason: `El comprobante muestra $${amount.toFixed(2)}, pero se esperaban $${expectedAmount.toFixed(2)}.`,
    };
  }

  const activeAccounts = accounts.filter((account) => account.activa);
  if (!activeAccounts.length) {
    return {
      valid: false,
      amount,
      reason: 'No hay cuentas de transferencia activas configuradas.',
    };
  }
  const extractedNumbers = [
    analysis?.destinationAccount,
    analysis?.cuentaDestino,
    analysis?.clabe,
    analysis?.ultimos4CuentaDestino,
  ]
    .map(normalizedDigits)
    .filter(Boolean);
  const extractedHolder = normalizedName(
    analysis?.destinationHolder ?? analysis?.titularDestino,
  );

  let strongMatch = false;
  let weakMatch = false;
  for (const account of activeAccounts) {
    const registeredNumbers = [account.cuenta, account.clabe]
      .map(normalizedDigits)
      .filter(Boolean);
    const registeredLast4 =
      normalizedDigits(account.ultimos4) ||
      registeredNumbers.find(Boolean)?.slice(-4) ||
      '';
    const numberMatches = extractedNumbers.some((extracted) =>
      extracted.length <= 4
        ? Boolean(registeredLast4 && extracted === registeredLast4)
        : registeredNumbers.some(
            (registered) =>
              registered === extracted ||
              registered.endsWith(extracted) ||
              extracted.endsWith(registered),
          ),
    );
    const registeredHolder = normalizedName(account.titular);
    const holderMatches = Boolean(
      extractedHolder &&
      registeredHolder &&
      (extractedHolder.includes(registeredHolder) ||
        registeredHolder.includes(extractedHolder)),
    );
    // Coincidencia parcial: mismo titular con últimos 4 dígitos con un solo
    // dígito distinto (posible error de OCR), útil para no rechazar de golpe
    // comprobantes legítimos con datos ligeramente mal leídos.
    const near4 =
      registeredLast4.length === 4 &&
      extractedNumbers.some((extracted) => {
        const last4 = extracted.length >= 4 ? extracted.slice(-4) : extracted;
        if (last4.length !== 4) return false;
        let shared = 0;
        for (let i = 0; i < 4; i++) {
          if (last4[i] === registeredLast4[i]) shared++;
        }
        return shared >= 3;
      });

    if (extractedNumbers.length ? numberMatches : holderMatches) {
      strongMatch = true;
      break;
    }
    if (holderMatches || near4) {
      weakMatch = true;
    }
  }

  if (!strongMatch && !weakMatch) {
    return {
      valid: false,
      amount,
      reason:
        'La cuenta, CLABE, últimos cuatro o titular del comprobante no coincide con una cuenta autorizada.',
    };
  }
  if (!strongMatch) {
    return {
      valid: false,
      amount,
      needsManualReview: true,
      reason:
        'La cuenta destino no coincide con certeza con ninguna cuenta autorizada; requiere revisión manual.',
    };
  }
  return { valid: true, amount };
}

export function extractHireDuration(text: string): number | undefined {
  if (/\d+[.,]\d+/.test(text)) {
    return undefined;
  }

  const match = text.match(/\b(\d+)\s*(?:h|hr|hrs|hora|horas)\b/i);
  if (match) {
    const hours = parseInt(match[1], 10);
    if (hours >= 1 && hours <= 24) return hours;
  }

  const normalized = text.toLowerCase().trim();
  const wordDurations: Record<string, number> = {
    una: 1,
    un: 1,
    uno: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
    once: 11,
    doce: 12,
  };
  const word = Object.keys(wordDurations).find(
    (candidate) =>
      normalized === candidate ||
      new RegExp(`\\b${candidate}\\s+(?:h|hr|hrs|hora|horas)\\b`).test(
        normalized,
      ),
  );
  return word ? wordDurations[word] : undefined;
}

export function extractHirePaymentMethod(
  text: string,
): SessionData['metodoPago'] | undefined {
  const normalized = text.toLowerCase();
  if (/\bmixto\b/.test(normalized)) return 'mixto';
  if (/\befectivo\b/.test(normalized)) return 'efectivo';
  if (/\btarjeta\b/.test(normalized)) return 'tarjeta';
  if (/\btransferencia\b/.test(normalized)) return 'transferencia';
  return undefined;
}

export function detectGroupServiceIntent(
  text: string,
): 'grupal' | 'incierta' | 'individual' {
  const normalized = text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  if (
    /\bservicio\s+grupal\b/.test(normalized) ||
    /\btrios?\b/.test(normalized) ||
    /\b(grupo\s+de\s+(chicas|empleadas)|varias\s+(chicas|empleadas|modelos)|mas\s+de\s+una\s+(chica|empleada|modelo)|(dos|tres|cuatro)\s+(chicas|empleadas|modelos))\b/.test(
      normalized,
    )
  )
    return 'grupal';
  if (
    /\b(acompanada|con\s+una\s+amiga|trae\s+una\s+amiga|alguien\s+mas)\b/.test(
      normalized,
    )
  )
    return 'incierta';
  return 'individual';
}

@Update()
export class TelegramBookingUpdate implements BeforeApplicationShutdown {
  private readonly logger = new Logger(TelegramBookingUpdate.name);
  private readonly clientMessageBuffers = new Map<
    string,
    {
      messages: string[];
      timer: NodeJS.Timeout;
      ctx: BotContext;
    }
  >();
  private readonly userLocationCache = new Map<
    string,
    {
      id: string;
      rol: string;
      name: string;
      lat: number;
      lng: number;
      lastSaved: number;
      dirty: boolean;
    }
  >();

  private readonly locationCleanupInterval: NodeJS.Timeout;

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
    @InjectRepository(AuthorizedBankAccounts)
    private readonly authorizedBankAccountsRepository: Repository<AuthorizedBankAccounts>,
    @InjectRepository(PaymentReceiptValidations)
    private readonly paymentReceiptValidationsRepository: Repository<PaymentReceiptValidations>,
    @InjectRepository(ExtrasCatalogo)
    private readonly extrasCatalogoRepository: Repository<ExtrasCatalogo>,
    @InjectRepository(ExtrasServicio)
    private readonly extrasServicioRepository: Repository<ExtrasServicio>,
    @InjectRepository(ConversacionesTelegram)
    private readonly conversationsRepository: Repository<ConversacionesTelegram>,
    private readonly realtimeEventsService: RealtimeEventsService,
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => ServicesService))
    private readonly servicesService: ServicesService,
    @Inject(forwardRef(() => TelegramService))
    private readonly telegramService: TelegramService,
    @Inject(forwardRef(() => TelegramAuthUpdate))
    private readonly telegramAuthUpdate: TelegramAuthUpdate,
    @Inject(forwardRef(() => LoyaltyService))
    private readonly loyaltyService: LoyaltyService,
    private readonly telegramBookingService: TelegramBookingService,
    private readonly aiMessageService: AiMessageService,
    private readonly employeeReportsService: EmployeeReportsService,
    private readonly extensionsService: ExtensionsService,
    private readonly transportOperations: TransportOperationsService,
    private readonly disciplineService: DisciplineService,
    private readonly groupServicesService: GroupServicesService,
    private readonly configService: ConfigService,
    private readonly uploadService: UploadService,
  ) {
    // TTL / Inactivity Cleanup: run every 5 minutes to clean up users inactive for > 1 hour
    this.locationCleanupInterval = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;
      for (const [key, cached] of this.userLocationCache.entries()) {
        if (now - cached.lastSaved > 3600000) {
          this.userLocationCache.delete(key);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        this.logger.log(
          `Inactivity cleanup: removed ${cleaned} inactive users from location cache.`,
        );
      }
    }, 300000);
  }

  private async createReceiptEvidence(
    ctx: BotContext,
    fileId: string,
    clientName?: string | null,
    serviceId?: string,
  ): Promise<{ validation: PaymentReceiptValidations; sourceUrl: string }> {
    const fileUrl = await ctx.telegram.getFileLink(fileId);
    const evidence = await this.uploadService.uploadEvidenceFromUrl({
      sourceUrl: fileUrl.href,
      folder: 'transferencias',
    });
    const now = new Date();
    const validation = await this.paymentReceiptValidationsRepository.save(
      this.paymentReceiptValidationsRepository.create({
        fechaRecepcion: now,
        horaRecepcion: now.toISOString().slice(11, 19),
        clienteTelegram: clientName ?? undefined,
        chatId: ctx.from?.id.toString(),
        imageUrl: evidence.url,
        telegramFileId: fileId,
        esComprobante: false,
        estado: 'PROCESANDO',
        servicioId: serviceId,
      }),
    );
    return { validation, sourceUrl: fileUrl.href };
  }

  private async finishReceiptValidation(
    validation: PaymentReceiptValidations,
    analysis: any,
    result: {
      valid: boolean;
      amount?: number;
      reason?: string;
      needsManualReview?: boolean;
    },
    extra?: { jefeId?: string; draftPayload?: any },
  ): Promise<PaymentReceiptValidations> {
    Object.assign(validation, {
      esComprobante: Boolean(analysis?.valid ?? analysis?.esComprobante),
      bancoOrigen: analysis?.bankOrigin ?? analysis?.bancoOrigen,
      bancoDestino: analysis?.bankDestination ?? analysis?.bancoDestino,
      titularDestino: analysis?.destinationHolder ?? analysis?.titularDestino,
      cuentaDestino: analysis?.destinationAccount ?? analysis?.cuentaDestino,
      clabe: analysis?.clabe,
      monto:
        result.amount ??
        parseReceiptAmount(analysis?.amount ?? analysis?.monto),
      fechaTransferencia:
        analysis?.transferDate ?? analysis?.fechaTransferencia,
      horaTransferencia: analysis?.transferTime ?? analysis?.horaTransferencia,
      referencia: analysis?.reference ?? analysis?.referencia,
      folio: analysis?.folio,
      idSpei:
        analysis?.trackingKey ?? analysis?.idSpei ?? analysis?.claveRastreo,
      concepto: analysis?.concept ?? analysis?.concepto,
      confianza: analysis?.confidence ?? analysis?.confianza,
      estado: result.valid
        ? 'APROBADO'
        : result.needsManualReview
          ? 'PENDIENTE_REVISION'
          : 'RECHAZADO',
      observaciones: result.reason ?? analysis?.reason ?? null,
      jsonIA: analysis,
      jefeId: extra?.jefeId,
      draftPayload: extra?.draftPayload ?? null,
    });
    return this.paymentReceiptValidationsRepository.save(validation);
  }

  private async markReceiptValidationError(
    validation: PaymentReceiptValidations | undefined,
    error: unknown,
  ): Promise<void> {
    if (!validation || validation.estado !== 'PROCESANDO') return;
    validation.estado = 'ERROR_VALIDACION';
    validation.observaciones =
      error instanceof Error ? error.message : 'Error inesperado de validación';
    await this.paymentReceiptValidationsRepository
      .save(validation)
      .catch(() => undefined);
  }

  private async findAssignedJefe(
    empleada: Empleadas,
  ): Promise<Usuarios | null> {
    if (empleada.jefeId) {
      const mainJefe = await this.usuariosRepository.findOne({
        where: { id: empleada.jefeId, activo: true },
      });
      if (mainJefe && mainJefe.disponible) {
        return mainJefe;
      }
      if (empleada.jefeSecundarioId) {
        const secJefe = await this.usuariosRepository.findOne({
          where: { id: empleada.jefeSecundarioId, activo: true },
        });
        if (secJefe && secJefe.disponible) {
          return secJefe;
        }
      }
    }
    let jefe = await this.usuariosRepository.findOne({
      where: [
        { rol: 'jefe', activo: true, disponible: true },
        { rol: 'admin', activo: true, disponible: true },
      ],
    });
    if (!jefe) {
      jefe = await this.usuariosRepository.findOne({
        where: [
          { rol: 'jefe', activo: true },
          { rol: 'admin', activo: true },
        ],
      });
    }
    return jefe;
  }

  private async applyDraftPaymentMethod(
    ctx: BotContext,
    method: 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto',
  ): Promise<boolean> {
    const session = ctx.session;
    if (
      !session?.locationLat ||
      !session.locationLng ||
      !session.empleadaId ||
      !session.duracionPactadaHoras
    ) {
      return false;
    }
    session.metodoPago = method;
    if (method === 'transferencia') {
      session.step = 'AWAITING_PAYMENT_RECEIPT';
      const bankDetails = await this.servicesService.bankTransferDetails();
      await ctx.reply(
        `*Cuentas disponibles para transferencia*\n\n${bankDetails}\n\nPor favor, envíame una *FOTO* del comprobante para verificar el pago.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('Cambiar a efectivo', 'pago_efectivo'),
              Markup.button.callback('Cambiar a tarjeta', 'pago_tarjeta'),
            ],
          ]),
        },
      );
      return true;
    }
    if (method === 'mixto') {
      session.step = 'AWAITING_MIXED_TRANSFER_AMOUNT';
      await ctx.reply(
        '¿Cuánto deseas pagar por transferencia bancaria? Ingresa el monto (solo números). El resto, junto con el transporte, se pagará en efectivo.',
      );
      return true;
    }
    const [client, employee] = await Promise.all([
      this.clientesRepository.findOne({
        where: { telegramChatId: ctx.from!.id.toString() },
      }),
      this.empleadasRepository.findOne({
        where: { id: session.empleadaId },
        relations: { usuario: true, jefe: true },
      }),
    ]);
    if (!client || !employee) return false;
    await ctx.reply(`Método de pago: *${method.toUpperCase()}*.`, {
      parse_mode: 'Markdown',
    });
    await this.finalizeBooking(
      ctx,
      client,
      employee,
      session.duracionPactadaHoras,
      method,
      session.locationLat,
      session.locationLng,
      session.locationNotas || null,
      ctx.from!.id.toString(),
    );
    return true;
  }

  // Graceful Shutdown Hook: Flush any dirty/unsaved location updates to DB
  async beforeApplicationShutdown() {
    if (this.locationCleanupInterval) {
      clearInterval(this.locationCleanupInterval);
    }
    this.logger.log(
      'Graceful shutdown: flushing dirty locations to database...',
    );
    let flushedCount = 0;
    for (const [telegramId, cached] of this.userLocationCache.entries()) {
      if (cached.dirty) {
        try {
          if (cached.rol === 'chofer') {
            await this.usuariosRepository.manager.update(Choferes, cached.id, {
              ubicacionLat: cached.lat,
              ubicacionLng: cached.lng,
              ultimaUbicacionAt: new Date(cached.lastSaved),
            });
            flushedCount++;
          } else if (cached.rol === 'empleada') {
            await this.usuariosRepository.manager.update(Empleadas, cached.id, {
              ubicacionLat: cached.lat,
              ubicacionLng: cached.lng,
              ultimaUbicacionAt: new Date(cached.lastSaved),
            });
            flushedCount++;
          }
          cached.dirty = false;
        } catch (err) {
          this.logger.error(
            `Error flushing location for telegramId=${telegramId}:`,
            err,
          );
        }
      }
    }
    if (flushedCount > 0) {
      this.logger.log(
        `Gracefully flushed ${flushedCount} locations to database.`,
      );
    }
  }

  // Helper function to calculate distance in meters using Haversine formula
  private getDistanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371e3; // Earth radius in meters
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) *
        Math.cos(phi2) *
        Math.sin(deltaLambda / 2) *
        Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // in meters
  }

  async getGroqResponse(
    systemPrompt: string,
    history: { role: 'user' | 'model'; parts: { text: string }[] }[],
    clientTelegramId?: string,
  ): Promise<string> {
    return this.telegramBookingService.getGroqResponse(
      systemPrompt,
      history,
      clientTelegramId,
    );
  }

  async sendDelayedReply(ctx: BotContext, text: string) {
    try {
      // Calculate realistic reading + typing delay based on message length (3.5s to 7.5s)
      const baseReadingMs = 1800 + Math.floor(Math.random() * 800);
      const typingMs = Math.min(Math.max((text.length || 20) * 45, 1500), 5000);
      const totalDelayMs = Math.min(
        Math.max(baseReadingMs + typingMs, 3500),
        7500,
      );

      // Enviar la acción de "escribiendo" de inmediato
      await ctx.sendChatAction('typing').catch(() => {});

      // Si la espera es mayor a 4s, refrescar la acción 'typing' a la mitad para mantenerla activa en Telegram
      if (totalDelayMs > 4000) {
        const halfMs = Math.floor(totalDelayMs / 2);
        await new Promise((resolve) => setTimeout(resolve, halfMs));
        await ctx.sendChatAction('typing').catch(() => {});
        await new Promise((resolve) =>
          setTimeout(resolve, totalDelayMs - halfMs),
        );
      } else {
        await new Promise((resolve) => setTimeout(resolve, totalDelayMs));
      }

      try {
        await ctx.reply(text, { parse_mode: 'Markdown' });
      } catch (mdErr) {
        this.logger.warn(
          'Error al enviar mensaje con Markdown, reenviando en texto plano:',
          mdErr,
        );
        await ctx.reply(text);
      }
    } catch (err) {
      this.logger.error('Error in sendDelayedReply:', err);
      try {
        await ctx.reply(text);
      } catch (finalErr) {
        this.logger.error('Error final en sendDelayedReply:', finalErr);
      }
    }
  }

  @Hears('/reputacion')
  async onEmployeeReputation(@Ctx() ctx: BotContext) {
    const user = await this.usuariosRepository.findOne({
      where: {
        telegramChatId: ctx.from!.id.toString(),
        rol: 'empleada',
      },
    });
    if (!user) return;
    const reputation = await this.disciplineService.ownReputation({
      id: user.id,
      rol: 'empleada',
    });
    const lines = reputation.ratings.map(
      (item: any) =>
        `${item.direction}: ${Number(item.average).toFixed(2)} (${item.count})`,
    );
    await ctx.reply(
      lines.length
        ? `Tu reputación por fuente:\n${lines.join('\n')}`
        : 'Todavía no tienes calificaciones.',
    );
  }

  @Action(/^contratar_empleada:(.+)$/)
  async onContratarEmpleada(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    const match = (ctx as any).match;
    if (!match) return;
    const empleadaId = match[1];
    await this.startHireSession(ctx, empleadaId);
  }

  @Action(/^gs:([^:]+):([^:]+):(\d+)$/)
  async onToggleGroupCatalogSelection(@Ctx() ctx: BotContext) {
    const match = (ctx as any).match;
    try {
      const result = await this.groupServicesService.toggleCatalogSelection(
        match[1],
        match[2],
        Number(match[3]),
      );
      await ctx.answerCbQuery(
        result.selected
          ? `${result.employeeName} seleccionada`
          : `${result.employeeName} retirada`,
      );
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [
          [
            Markup.button.callback(
              result.selected ? 'Retirar' : 'Seleccionar',
              (ctx.callbackQuery as any).data,
            ),
          ],
        ],
      });
    } catch (error: any) {
      await ctx.answerCbQuery(error.message || 'No se pudo actualizar', {
        show_alert: true,
      });
    }
  }

  @Action(/^gsc:([^:]+):(\d+)$/)
  async onConfirmGroupCatalog(@Ctx() ctx: BotContext) {
    const match = (ctx as any).match;
    try {
      const request = await this.groupServicesService.confirmClientCatalog(
        match[1],
        Number(match[2]),
      );
      await ctx.answerCbQuery('Selección reservada');
      await ctx.editMessageText(
        `Tu selección de ${request.selections.filter((item) => item.status === 'reservada').length} empleadas quedó reservada durante 30 minutos. El jefe puede ajustarla antes de enviarte la cotización final.`,
      );
    } catch (error: any) {
      await ctx.answerCbQuery(error.message || 'No se pudo reservar', {
        show_alert: true,
      });
    }
  }

  @Action(/^esperar_ocupada:(.+)$/)
  async onWaitForBusyEmployee(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    if (!ctx.session || ctx.session.empleadaId !== (ctx as any).match?.[1]) {
      await ctx.reply('La sesión expiró. Selecciona nuevamente a la empleada.');
      return;
    }
    ctx.session.waitingForBusyChoice = false;
    const message =
      'Perfecto. Continuemos con la duración que necesitas y tu método de pago.';
    await ctx.reply(message);
    await this.recordDraftConversation(ctx, 'sistema', message);
  }

  @Action('ver_disponibles')
  async onShowAvailableEmployees(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    await this.showAvailableEmployeeCatalog(ctx);
  }

  private async showAvailableEmployeeCatalog(ctx: BotContext): Promise<void> {
    const employees = await this.empleadasRepository.find({
      where: { disponible: true, catalogoActivo: true },
      order: { nombreArtistico: 'ASC' },
    });
    if (!employees.length) {
      await ctx.reply('Por ahora no hay otras empleadas disponibles.');
      return;
    }
    const message = 'Estas empleadas están disponibles en este momento:';
    await ctx.reply(message, {
      ...Markup.inlineKeyboard(
        employees.map((employee) => [
          Markup.button.callback(
            employee.nombreArtistico,
            `contratar_empleada:${employee.id}`,
          ),
        ]),
      ),
    });
    await this.recordDraftConversation(ctx, 'sistema', message);
  }

  async startHireSession(ctx: any, empleadaId: string) {
    const empleada = await this.empleadasRepository.findOne({
      where: { id: empleadaId },
    });

    if (!empleada || !empleada.catalogoActivo) {
      await ctx.reply(
        'La empleada seleccionada no está activa en el catálogo.',
      );
      return;
    }
    const activeService = await this.serviciosRepository.findOne({
      where: { empleadaId, estado: 'en_curso' },
    });
    if (!activeService && !empleada.disponible) {
      await ctx.reply(
        'La empleada no está disponible operativamente en este momento.',
      );
      return;
    }
    const queuedService = activeService
      ? await this.serviciosRepository.findOne({
          where: [
            {
              empleadaId,
              servicioPrevioId: activeService.id,
              estado: 'pendiente',
            },
            {
              empleadaId,
              servicioPrevioId: activeService.id,
              estado: 'agendado',
            },
          ],
        })
      : null;

    const apiKey = process.env.XAI_API_KEY || process.env.GROQ_API_KEY;
    if (!apiKey) {
      await ctx.reply(
        '⚠️ El sistema de IA no está configurado (falta XAI_API_KEY en el servidor). Por favor contacta al administrador.',
      );
      return;
    }

    // Cada contratación debe comenzar sin datos residuales de servicios,
    // calificaciones o conversaciones anteriores.
    ctx.session = {
      step: 'CHAT_CON_EMPLEADA',
      empleadaId,
      bookingSessionId: randomUUID(),
      selectedEmployeeBusy: Boolean(activeService),
      waitingForBusyChoice: Boolean(activeService),
    };

    if (activeService) {
      const estimated = activeService.horaInicioServicio
        ? new Date(
            activeService.horaInicioServicio.getTime() +
              Number(activeService.duracionPactadaHoras) * 3_600_000,
          )
        : null;
      const eta = estimated
        ? estimated.toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'America/Mexico_City',
          })
        : 'por confirmar';
      const busyMessage = queuedService
        ? `${empleada.nombreArtistico} está ocupada y ya tiene reservado su siguiente servicio.`
        : `${empleada.nombreArtistico} está ocupada. Estará libre aproximadamente a las ${eta}. Soy el asistente de la agencia; puedo ayudarte a esperar por ella o mostrarte opciones disponibles.`;
      await ctx.reply(busyMessage, {
        ...Markup.inlineKeyboard([
          ...(queuedService
            ? []
            : [
                [
                  Markup.button.callback(
                    `Esperar a ${empleada.nombreArtistico}`,
                    `esperar_ocupada:${empleada.id}`,
                  ),
                ],
              ]),
          [
            Markup.button.callback(
              'Ver empleadas disponibles',
              'ver_disponibles',
            ),
          ],
        ]),
      });
      await this.recordDraftConversation(ctx, 'sistema', busyMessage);
      if (queuedService) return;
    } else {
      const waitingMessage = `Espere por favor, estamos poniéndonos en contacto con *${empleada.nombreArtistico}*...`;
      await ctx.reply(waitingMessage, { parse_mode: 'Markdown' });
      await this.recordDraftConversation(ctx, 'sistema', waitingMessage);
    }

    const [empleadaExtras, presetLocations] = await Promise.all([
      this.extrasCatalogoRepository.find({
        where: { empleadaId: empleada.id, activo: true },
      }),
      this.transportOperations.activeLocations(),
    ]);

    const extrasData = empleadaExtras.map((e) => ({
      nombre: e.nombre,
      precio: Number(e.precio),
    }));
    const ubicacionesData = presetLocations.map(
      (l) => `${l.name}${l.address ? ` (${l.address})` : ''}`,
    );

    const promptParams = {
      nombreArtistico: empleada.nombreArtistico,
      precioBaseHora: empleada.precioBaseHora,
      descripcion: empleada.descripcion,
      extras: extrasData,
      ubicacionesPreestablecidas: ubicacionesData,
    };

    const systemPrompt = activeService
      ? `Eres el asistente de una agencia. Nunca finjas ser la empleada. Ayuda al cliente a coordinar para reservar el siguiente turno de ${empleada.nombreArtistico}. ${getHireSystemPrompt(promptParams)}`
      : getHireSystemPrompt(promptParams);

    const history: { role: 'user' | 'model'; parts: { text: string }[] }[] = [
      { role: 'user', parts: [{ text: 'Hola' }] },
    ];

    const telegramId = ctx.from?.id?.toString();

    try {
      await ctx.sendChatAction('typing');
      const responseText = await this.getGroqResponse(
        systemPrompt,
        history,
        telegramId,
      );
      history.push({ role: 'model', parts: [{ text: responseText }] });
      ctx.session.chatHistory = history;

      await this.sendDelayedReply(ctx, responseText);
      await this.recordDraftConversation(ctx, 'ia', responseText);
    } catch (err: any) {
      if (err?.message === 'AI_LIMIT_REACHED') {
        await ctx.reply(
          '⚠️ *Límite de IA alcanzado:* Has agotado tus consultas gratuitas de hoy con la Inteligencia Artificial. Por favor, intenta de nuevo mañana.',
          { parse_mode: 'Markdown' },
        );
        return;
      }
      this.logger.error('Error starting LLM chat session:', err);
      const fallbackMsg = `¡Hola papi! Soy *${empleada.nombreArtistico}*, estoy libre para ti mor. Mi tarifa es de $${empleada.precioBaseHora}/hr, ¿cuántas horas me vas a contratar?`;
      await this.sendDelayedReply(ctx, fallbackMsg);
      await this.recordDraftConversation(ctx, 'ia', fallbackMsg);
      // Initialize basic history on error fallback
      ctx.session.chatHistory = [
        { role: 'user', parts: [{ text: 'Hola' }] },
        {
          role: 'model',
          parts: [{ text: fallbackMsg }],
        },
      ];
    }
  }

  async startDirectGroupSession(ctx: BotContext) {
    ctx.session = {
      bookingSessionId: randomUUID(),
    };
    try {
      await this.handoffGroupRequest(ctx);
    } catch (error) {
      if (error instanceof ForbiddenException) {
        await ctx.reply(
          'No es posible crear la solicitud porque tu cuenta no está habilitada para contratar. Contacta al equipo si necesitas ayuda.',
        );
        return;
      }
      if (error instanceof ConflictException) {
        await ctx.reply(
          'En este momento no hay un jefe disponible para organizar el servicio grupal. Inténtalo nuevamente más tarde.',
        );
        return;
      }
      this.logger.error(
        'Error starting direct group service session',
        error instanceof Error ? error.stack : String(error),
      );
      await ctx.reply(
        'No pudimos iniciar el servicio grupal. Inténtalo nuevamente en unos minutos.',
      );
    }
  }

  @Action(/^duracion_(\d+(\.\d+)?)$/)
  async onSelectDuration(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    if (ctx.session?.step !== 'AWAITING_DURATION') {
      await ctx.reply('No hay ningún proceso de contratación activo.');
      return;
    }

    const match = (ctx as any).match;
    const duracion = parseFloat(match[1]);

    ctx.session.duracionPactadaHoras = duracion;
    ctx.session.step = 'AWAITING_LOCATION';
    await this.recordDraftConversation(
      ctx,
      'cliente',
      `Duración seleccionada: ${duracion} horas`,
    );

    try {
      await ctx.editMessageText(
        `Duración registrada: *${duracion} horas*.\n\n` +
          clientMessages.locationRequest(),
        {
          parse_mode: 'Markdown',
        },
      );
    } catch (err) {
      await ctx.reply(
        `Duración registrada: *${duracion} horas*.\n\n` +
          clientMessages.locationRequest(),
        {
          parse_mode: 'Markdown',
        },
      );
    }

    await this.replyWithServiceLocationOptions(ctx);
  }

  @Action(/^pago_(efectivo|tarjeta|transferencia|mixto)$/)
  async onSelectPayment(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    const session = ctx.session;
    if (
      !session ||
      ![
        'AWAITING_PAYMENT_METHOD',
        'AWAITING_PAYMENT_RECEIPT',
        'AWAITING_MIXED_TRANSFER_AMOUNT',
      ].includes(session.step || '')
    ) {
      await ctx.reply('No hay ningún proceso de contratación activo.');
      return;
    }

    const match = (ctx as any).match;
    const metodo = match[1] as
      'efectivo' | 'tarjeta' | 'transferencia' | 'mixto';

    session.metodoPago = metodo;

    await this.recordDraftConversation(
      ctx,
      'cliente',
      `Método de pago seleccionado: ${metodo}`,
    );

    try {
      // Remover los botones inline de pago
      await ctx.editMessageReplyMarkup(undefined);
    } catch {
      // El mensaje puede haber sido editado o eliminado; el flujo continua.
    }

    const {
      locationLat,
      locationLng,
      locationNotas,
      empleadaId,
      duracionPactadaHoras,
    } = session;

    if (!locationLat || !locationLng || !empleadaId || !duracionPactadaHoras) {
      await ctx.reply('Datos incompletos. Por favor inicia nuevamente.');
      ctx.session = {};
      return;
    }

    const bankDetails = await this.servicesService.bankTransferDetails();

    if (metodo === 'transferencia') {
      session.step = 'AWAITING_PAYMENT_RECEIPT';
      await ctx.reply(
        `${bankDetails}\n\nPor favor, envíame una *FOTO* del comprobante de transferencia para verificar el pago.`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('Cambiar a efectivo', 'pago_efectivo'),
              Markup.button.callback('Cambiar a tarjeta', 'pago_tarjeta'),
            ],
          ]),
        },
      );
      return;
    }

    if (metodo === 'mixto') {
      session.step = 'AWAITING_MIXED_TRANSFER_AMOUNT';
      await ctx.reply(
        '¿Cuánto deseas pagar por transferencia bancaria? Ingresa el monto (solo números). El resto, junto con el transporte, se pagará en efectivo.',
      );
      return;
    }

    // Efectivo / Tarjeta proceden directo
    const client = await this.clientesRepository.findOne({
      where: { telegramChatId: ctx.from!.id.toString() },
    });
    const empleada = await this.empleadasRepository.findOne({
      where: { id: empleadaId },
      relations: { usuario: true, jefe: true },
    });
    if (!client || !empleada) return;

    await this.finalizeBooking(
      ctx,
      client,
      empleada,
      duracionPactadaHoras,
      metodo,
      locationLat,
      locationLng,
      locationNotas || null,
      ctx.from!.id.toString(),
    );
  }

  @Action(/^service_location:(external|[0-9a-f-]{36})$/)
  async onSelectServiceLocation(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    if (ctx.session?.step !== 'AWAITING_LOCATION') {
      await ctx.reply('No hay un proceso de contratación activo.');
      return;
    }
    const id = (ctx as any).match[1] as string;
    if (id === 'external') {
      const configuration = await this.transportOperations.getConfiguration();
      ctx.session.presetLocationId = undefined;
      ctx.session.locationNameSnapshot = undefined;
      ctx.session.locationAddressSnapshot = undefined;
      ctx.session.customerTransportCharge = Number(
        configuration.externalLocationFee,
      );
      await this.replyWithLocationKeyboard(
        ctx,
        'Perfecto. En ese caso, mándame el pin del lugar donde quieres que nos encontremos.',
      );
      return;
    }
    const location = (await this.transportOperations.activeLocations()).find(
      (item) => item.id === id,
    );
    if (!location) {
      await ctx.reply('La ubicación seleccionada ya no está disponible.');
      return;
    }
    ctx.session.presetLocationId = location.id;
    ctx.session.locationNameSnapshot = location.name;
    ctx.session.locationAddressSnapshot = location.address;
    ctx.session.customerTransportCharge = 0;
    await this.onLocation(ctx, {
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      title: location.name,
      address: location.address,
    });
  }

  private async replyWithLocationKeyboard(
    ctx: BotContext,
    text: string,
  ): Promise<void> {
    await ctx.reply(text, {
      parse_mode: 'Markdown',
      ...Markup.keyboard([
        [Markup.button.locationRequest('Compartir mi Ubicación')],
      ])
        .oneTime()
        .resize(),
    });
  }

  private async replyWithServiceLocationOptions(
    ctx: BotContext,
    introduction = '¡De una mi amor! Dime en qué lugar prefieres que nos encontremos. Elige una de nuestras opciones o selecciona "Otra ubicación" para enviarme tu pin:',
  ): Promise<void> {
    await ctx.sendChatAction('typing').catch(() => {});
    const delayMs = 2500 + Math.floor(Math.random() * 1500);
    await new Promise((resolve) => setTimeout(resolve, delayMs));

    const locations = await this.transportOperations.activeLocations();
    const rows = locations.map((location) => [
      Markup.button.callback(location.name, `service_location:${location.id}`),
    ]);
    rows.push([
      Markup.button.callback('Otra ubicación', 'service_location:external'),
    ]);
    await ctx.reply(introduction, {
      ...Markup.removeKeyboard(),
      ...Markup.inlineKeyboard(rows),
    });
  }

  @Action(/^agregar_extra_list:(.+)$/)
  async onAgregarExtraList(@Ctx() ctx: BotContext) {
    const match = (ctx as any).match;
    if (!match) return;
    const servicioId = match[1];

    const servicio = await this.serviciosRepository.findOne({
      where: { id: servicioId },
      relations: { empleada: true },
    });

    if (!servicio) {
      await ctx.reply('Servicio no encontrado.');
      return;
    }

    if (!(await this.isAssignedEmployee(ctx, servicio))) {
      await ctx.answerCbQuery('No puedes modificar este servicio.', {
        show_alert: true,
      });
      return;
    }
    if (servicio.estado !== 'en_curso') {
      await ctx.answerCbQuery('Este servicio ya no está activo.', {
        show_alert: true,
      });
      return;
    }

    await ctx.answerCbQuery();
    const groupAccess =
      servicio.serviceType === 'grupal'
        ? await this.groupServicesService.participantAccess(
            servicio.id,
            ctx.from!.id.toString(),
          )
        : null;
    const extrasEmployeeId =
      groupAccess?.participant.employeeId ?? servicio.empleadaId;

    // Buscar extras activos de la empleada
    const extras = await this.extrasCatalogoRepository.find({
      where: { empleadaId: extrasEmployeeId, activo: true },
      order: { nombre: 'ASC' },
    });

    if (extras.length === 0) {
      await ctx.reply(
        '⚠️ No tienes registrados servicios extras en tu catálogo.\n' +
          'Solicita a administración que los configure en el panel.',
      );
      return;
    }

    if (!ctx.session) {
      ctx.session = {};
    }
    // Guardar el servicioId inicial en la sesión
    ctx.session.extraSelection = {
      servicioId,
      extraId: '',
      participantId: groupAccess?.participant.id,
    };

    const inlineButtons = extras.map((extra) => [
      Markup.button.callback(
        `➕ ${extra.nombre} ($${extra.precio})`,
        `agregar_extra_sel:${extra.id}`,
      ),
    ]);

    // Botón para regresar al menú de servicio
    inlineButtons.push([
      Markup.button.callback('🔙 Volver', `canc_fin_serv:${servicioId}`),
    ]);

    await ctx.editMessageText(
      `➕ *Selecciona el servicio extra a agregar:*\n\n` +
        `Se te solicitará seleccionar el método de pago del extra en el siguiente paso.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(inlineButtons),
      },
    );
  }

  @Action(/^agregar_extra_sel:(.+)$/)
  async onAgregarExtraSel(@Ctx() ctx: BotContext) {
    const match = (ctx as any).match;
    if (!match) return;
    const extraId = match[1];

    const session = ctx.session;
    if (
      !session ||
      !session.extraSelection ||
      !session.extraSelection.servicioId
    ) {
      await ctx.reply(
        '❌ La sesión ha expirado o el menú es antiguo. Por favor, vuelve a presionar "Agregar Extra" en el panel.',
      );
      return;
    }

    const servicioId = session.extraSelection.servicioId;

    const servicio = await this.serviciosRepository.findOne({
      where: { id: servicioId },
    });

    const extra = await this.extrasCatalogoRepository.findOne({
      where: { id: extraId },
    });

    if (!servicio || !extra) {
      await ctx.reply('❌ Servicio o extra no encontrado.');
      return;
    }

    if (!(await this.isAssignedEmployee(ctx, servicio))) {
      await ctx.answerCbQuery('No puedes modificar este servicio.', {
        show_alert: true,
      });
      return;
    }
    const access =
      servicio.serviceType === 'grupal'
        ? await this.groupServicesService.participantAccess(
            servicio.id,
            ctx.from!.id.toString(),
          )
        : null;
    if (
      access &&
      (extra.empleadaId !== access.participant.employeeId ||
        session.extraSelection.participantId !== access.participant.id)
    ) {
      await ctx.answerCbQuery('Ese extra no pertenece a tu catálogo.', {
        show_alert: true,
      });
      return;
    }
    if (servicio.estado !== 'en_curso') {
      await ctx.answerCbQuery('Este servicio ya no está activo.', {
        show_alert: true,
      });
      return;
    }

    await ctx.answerCbQuery();

    // Guardar el extraId seleccionado en la sesión
    session.extraSelection.extraId = extraId;

    const inlineButtons = [
      [
        Markup.button.callback('Tarjeta', `agregar_extra_pay:tarjeta`),
        Markup.button.callback(
          'Transferencia',
          `agregar_extra_pay:transferencia`,
        ),
      ],
      [Markup.button.callback('Efectivo', `agregar_extra_pay:efectivo`)],
      [Markup.button.callback('Volver', `agregar_extra_list:${servicioId}`)],
    ];

    await ctx.editMessageText(
      `*Selecciona el método de pago* para el extra *${extra.nombre}* ($${extra.precio}):\n\n` +
        `Las ganancias de los extras van directamente a ti.`,
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(inlineButtons),
      },
    );
  }

  @Action(/^agregar_extra_pay:(.+)$/)
  async onAgregarExtraPay(@Ctx() ctx: BotContext) {
    const match = (ctx as any).match;
    if (!match) return;
    const metodoPago = match[1] as 'tarjeta' | 'transferencia' | 'efectivo';

    const session = ctx.session;
    if (!session || !session.extraSelection) {
      await ctx.reply(
        '❌ La sesión ha expirado o el menú es antiguo. Por favor, vuelve a intentar agregar el extra.',
      );
      return;
    }

    const { servicioId, extraId, participantId } = session.extraSelection;
    // Limpiar selección de la sesión
    delete session.extraSelection;

    const servicio = await this.serviciosRepository.findOne({
      where: { id: servicioId },
      relations: { empleada: { usuario: true } },
    });

    const extra = await this.extrasCatalogoRepository.findOne({
      where: { id: extraId },
    });

    if (!servicio || !extra) {
      await ctx.reply('❌ Servicio o extra no encontrado.');
      return;
    }

    if (!(await this.isAssignedEmployee(ctx, servicio))) {
      await ctx.answerCbQuery('No puedes modificar este servicio.', {
        show_alert: true,
      });
      return;
    }
    const access =
      servicio.serviceType === 'grupal'
        ? await this.groupServicesService.participantAccess(
            servicio.id,
            ctx.from!.id.toString(),
          )
        : null;
    if (
      access &&
      (extra.empleadaId !== access.participant.employeeId ||
        participantId !== access.participant.id)
    ) {
      await ctx.answerCbQuery('Ese extra no pertenece a tu catálogo.', {
        show_alert: true,
      });
      return;
    }

    if (servicio.estado !== 'en_curso') {
      await ctx.answerCbQuery('Este servicio ya no está activo.', {
        show_alert: true,
      });
      return;
    }

    await ctx.answerCbQuery();

    const telegramId = ctx.from?.id.toString();
    const user = await this.usuariosRepository.findOne({
      where: { telegramChatId: telegramId },
    });

    if (!user) {
      await ctx.reply('❌ Usuario del sistema no autenticado.');
      return;
    }

    // Registrar el extra en el servicio con el metodo de pago seleccionado
    const extraServicio = this.extrasServicioRepository.create({
      servicioId: servicio.id,
      extraCatalogoId: extra.id,
      participantId: participantId ?? null,
      precioCobrado: extra.precio,
      metodoPago: metodoPago,
      registradoPor: user,
    });

    await this.extrasServicioRepository.save(extraServicio);

    // Volver a cargar el servicio actualizado con la relación de extras
    const servicioActualizado = await this.serviciosRepository.findOne({
      where: { id: servicioId },
      relations: {
        cliente: true,
        empleada: true,
        extrasServicios: { extraCatalogo: true },
      },
    });

    const total = servicioActualizado?.totalFinal || servicio.totalFinal;
    const extrasList = servicioActualizado?.extrasServicios || [];
    const totalExtras = extrasList
      .reduce((sum, e) => sum + Number(e.precioCobrado), 0)
      .toFixed(2);

    let extrasBreakdownStr = '';
    if (extrasList.length > 0) {
      extrasBreakdownStr =
        `• *Desglose de Extras:*\n` +
        extrasList
          .map(
            (e) =>
              `  - ${e.extraCatalogo?.nombre || 'Extra'}: $${e.precioCobrado} (${e.metodoPago.toUpperCase()})`,
          )
          .join('\n') +
        '\n';
    }

    await ctx.reply(
      `✅ Servicio extra *${extra.nombre}* ($${extra.precio}) agregado con método de pago *${metodoPago.toUpperCase()}* con éxito.`,
      { parse_mode: 'Markdown' },
    );

    const inlineButtons: any[] = [
      ...(servicio.serviceType !== 'grupal' || access?.responsible
        ? [
            [
              Markup.button.callback(
                '🏁 Finalizar Servicio',
                `finalizar_servicio:${servicio.id}`,
              ),
            ],
          ]
        : []),
      [
        Markup.button.callback(
          '➕ Agregar Extra',
          `agregar_extra_list:${servicio.id}`,
        ),
      ],
    ];

    const updatedMsg =
      `💼 *¡Servicio en Curso!* 🟢\n\n` +
      `• *Cliente:* ${servicioActualizado?.cliente?.nombreTelegram || 'Desconocido'}\n` +
      `• *Duración:* ${servicioActualizado?.duracionPactadaHoras} horas\n` +
      `• *Método de Pago:* ${servicioActualizado?.metodoPago?.toUpperCase() || ''}\n` +
      `• *Total de Extras:* $${totalExtras}\n` +
      (extrasBreakdownStr ? `${extrasBreakdownStr}` : '') +
      `• *Total Acumulado del Servicio (Base):* $${total}\n\n` +
      `Cuando hayas terminado el servicio, presiona el botón de abajo para finalizarlo:`;

    await ctx.editMessageText(updatedMsg, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(inlineButtons),
    });
  }
  @Action(/^finalizar_servicio:(.+)$/)
  async onFinalizarServicio(@Ctx() ctx: Context) {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const match = (ctx as any).match;
    if (!match) return;
    const servicioId = match[1];

    const servicio = await this.serviciosRepository.findOne({
      where: { id: servicioId },
    });

    if (!servicio) {
      await ctx.answerCbQuery('❌ Servicio no encontrado.', {
        show_alert: true,
      });
      return;
    }

    if (!(await this.isAssignedEmployee(ctx, servicio))) {
      await ctx.answerCbQuery('No puedes modificar este servicio.', {
        show_alert: true,
      });
      return;
    }
    if (servicio.serviceType === 'grupal') {
      const access = await this.groupServicesService.participantAccess(
        servicio.id,
        telegramId,
      );
      if (!access?.responsible) {
        await ctx.answerCbQuery(
          'Solamente la responsable puede finalizar el servicio.',
          { show_alert: true },
        );
        return;
      }
    }

    if (servicio.estado !== 'en_curso') {
      await ctx.answerCbQuery('Este servicio ya no está activo.', {
        show_alert: true,
      });
      return;
    }

    await ctx.answerCbQuery();

    const originalText = (ctx.callbackQuery?.message as any)?.text || '';
    if (originalText.includes('⚠️ ¿Confirmas')) {
      return;
    }

    const warnHeader = `⚠️ *¿Confirmas que deseas FINALIZAR este servicio? Esta acción no se puede deshacer.*\n\n`;

    await ctx.editMessageText(warnHeader + originalText, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            '✅ Sí, finalizar',
            `conf_fin_serv:${servicioId}`,
          ),
          Markup.button.callback('❌ Cancelar', `canc_fin_serv:${servicioId}`),
        ],
      ]),
    });
  }

  @Action(/^eu:([^:]+):([if])$/)
  async onEmployeeUberStatus(@Ctx() ctx: BotContext) {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;
    const user = await this.usuariosRepository.findOne({
      where: { telegramChatId: telegramId },
    });
    if (!user)
      return ctx.answerCbQuery('Usuario no autorizado', { show_alert: true });
    const match = (ctx as any).match;
    try {
      await this.servicesService.updateUberStatus(
        match[1],
        user.id,
        match[2] === 'f' ? 'employee_arrived' : 'employee_en_route',
      );
      await ctx.answerCbQuery(
        match[2] === 'f' ? 'Llegada registrada' : 'Cliente notificado',
      );
      if (match[2] === 'i') {
        await ctx.editMessageText(
          'Cuando llegues al destino, confirma tu llegada.',
          {
            ...Markup.inlineKeyboard([
              [Markup.button.callback('📍 Ya llegué', `eu:${match[1]}:f`)],
            ]),
          },
        );
      } else {
        await ctx
          .editMessageText('Tu llegada quedó registrada.')
          .catch(() => undefined);
        const trip = await this.viajesRepository.findOne({
          where: { id: match[1] },
          relations: { servicio: { cliente: true } },
        });
        if (
          trip &&
          trip.tipo === 'ida' &&
          trip.servicio.estado === 'en_curso'
        ) {
          const serviceMessage = await ctx.reply(
            `*Servicio en curso*\n\n` +
              `• *Cliente:* ${trip.servicio.cliente?.nombreTelegram || 'Desconocido'}\n` +
              `• *Duración:* ${trip.servicio.duracionPactadaHoras} horas\n` +
              `• *Método de pago:* ${trip.servicio.metodoPago.toUpperCase()}\n\n` +
              `Cuando termine la actividad con el cliente, finaliza el servicio desde aquí.`,
            {
              parse_mode: 'Markdown',
              ...Markup.inlineKeyboard([
                [
                  Markup.button.callback(
                    'Finalizar servicio',
                    `finalizar_servicio:${trip.servicio.id}`,
                  ),
                ],
                [
                  Markup.button.callback(
                    'Agregar extra',
                    `agregar_extra_list:${trip.servicio.id}`,
                  ),
                ],
              ]),
            },
          );
          await this.serviciosRepository.update(trip.servicio.id, {
            telegramEmpleadaMensajeId: serviceMessage.message_id.toString(),
          });
        }
      }
    } catch (error: any) {
      await ctx.answerCbQuery(error.message, { show_alert: true });
    }
  }

  @On('photo')
  async onPhotoUpload(@Ctx() ctx: BotContext) {
    const senderTelegramId = ctx.from?.id.toString();

    if (
      ctx.session?.step === 'AWAITING_UBER_SCREENSHOT' &&
      ctx.session.uberTripId
    ) {
      const photos = (ctx.message as any)?.photo as
        Array<{ file_id: string }> | undefined;
      const fileId = photos?.[photos.length - 1]?.file_id;
      if (!fileId) {
        await ctx.reply(
          'Por favor, envía una FOTO (captura de pantalla) del Uber.',
        );
        return;
      }
      const actor = senderTelegramId
        ? await this.usuariosRepository.findOneBy({
            telegramChatId: senderTelegramId,
          })
        : null;
      if (!actor || (actor.rol !== 'admin' && actor.rol !== 'jefe')) {
        await ctx.reply(
          'No estás autorizado para adjuntar la captura del Uber.',
        );
        return;
      }
      try {
        await this.servicesService.saveUberScreenshot(
          ctx.session.uberTripId,
          actor.id,
          fileId,
        );
        ctx.session.step = 'AWAITING_UBER_FARE';
        await ctx.reply(
          '📸 Captura de Uber guardada exitosamente.\n\nEscribe ahora el costo final del Uber, por ejemplo: 185.50',
        );
      } catch (error: any) {
        await ctx.reply(
          error.message || 'No fue posible guardar la captura del Uber.',
        );
      }
      return;
    }

    const groupRequest = senderTelegramId
      ? await this.groupServicesService.findActiveRequestByClientTelegram(
          senderTelegramId,
        )
      : null;
    if (
      groupRequest?.service &&
      groupRequest.service.metodoPago === 'transferencia' &&
      Number(groupRequest.service.pendingBalance) > 0.009
    ) {
      const photos = (ctx.message as any)?.photo as
        Array<{ file_id: string }> | undefined;
      const fileId = photos?.[photos.length - 1]?.file_id;
      if (!fileId) return;
      const pending = Number(groupRequest.service.pendingBalance);
      const processing = await ctx.reply(
        'Verificando el comprobante del servicio grupal...',
      );
      let validation: PaymentReceiptValidations | undefined;
      try {
        const stored = await this.createReceiptEvidence(
          ctx,
          fileId,
          groupRequest.client.nombreTelegram,
          groupRequest.service.id,
        );
        validation = stored.validation;
        const analysis = await this.aiMessageService.analyzeReceipt(
          stored.sourceUrl,
          pending,
        );
        const accounts = await this.authorizedBankAccountsRepository.find({
          where: { activa: true },
        });
        const receipt = validateReceiptAnalysis(analysis, pending, accounts);
        validation = await this.finishReceiptValidation(
          validation,
          analysis,
          receipt,
          { jefeId: groupRequest.bossId },
        );
        await ctx.telegram
          .deleteMessage(ctx.chat!.id, processing.message_id)
          .catch(() => undefined);
        if (receipt.needsManualReview) {
          await ctx.reply(
            'Tu comprobante quedó en revisión manual. El jefe lo validará en breve.',
          );
          const bossUser = await this.usuariosRepository.findOne({
            where: { id: groupRequest.bossId },
          });
          const target = bossUser?.grupoTelegramId || bossUser?.telegramChatId;
          if (target) {
            await ctx.telegram
              .sendMessage(
                target,
                `Hay un comprobante del servicio grupal en revisión manual. Revísalo en el panel de Evidencias.`,
              )
              .catch(() => undefined);
          }
          return;
        }
        if (!receipt.valid || !receipt.amount) {
          await ctx.reply(
            `No se pudo aprobar el comprobante: ${receipt.reason || 'no se identificó un pago válido'}.`,
          );
          return;
        }
        const amount = receipt.amount;
        const updated = await this.groupServicesService.registerPayment(
          groupRequest.service.id,
          {
            amount,
            receiptValidationId: validation.id,
          },
          { id: groupRequest.bossId, rol: 'jefe' },
        );
        if (Number(updated.pendingBalance) > 0.009) {
          await ctx.reply(
            `Comprobante aprobado por $${amount.toFixed(2)}. Saldo pendiente: $${Number(updated.pendingBalance).toFixed(2)}.`,
          );
        } else {
          await ctx.reply(
            'Comprobante aprobado. El jefe ya puede iniciar o aplicar el cambio del servicio grupal.',
          );
        }
      } catch (error: any) {
        await this.markReceiptValidationError(validation, error);
        await ctx.telegram
          .deleteMessage(ctx.chat!.id, processing.message_id)
          .catch(() => undefined);
        await ctx.reply(
          error.message || 'No fue posible validar el comprobante.',
        );
      }
      return;
    }

    if (ctx.session?.step === 'AWAITING_PAYMENT_RECEIPT') {
      const {
        locationLat,
        locationLng,
        locationNotas,
        empleadaId,
        duracionPactadaHoras,
        metodoPago,
      } = ctx.session;

      if (
        !locationLat ||
        !locationLng ||
        !empleadaId ||
        !duracionPactadaHoras ||
        !metodoPago
      ) {
        await ctx.reply('❌ Datos incompletos. Por favor inicia nuevamente.');
        ctx.session = {};
        return;
      }

      const client = await this.clientesRepository.findOne({
        where: { telegramChatId: ctx.from!.id.toString() },
      });
      const empleada = await this.empleadasRepository.findOne({
        where: { id: empleadaId },
      });
      if (!client || !empleada) return;

      const photos = (ctx.message as any)?.photo as
        Array<{ file_id: string }> | undefined;
      const fileId = photos?.[photos.length - 1]?.file_id;
      if (!fileId) {
        await ctx.reply(
          'Por favor, envía una FOTO (no archivo) del comprobante.',
        );
        return;
      }

      const processingMsg = await ctx.reply(
        '🔍 Verificando comprobante, por favor espera un momento...',
      );

      let validation: PaymentReceiptValidations | undefined;
      try {
        const stored = await this.createReceiptEvidence(
          ctx,
          fileId,
          client.nombreTelegram,
        );
        validation = stored.validation;
        const totalBase =
          duracionPactadaHoras * Number(empleada.precioBaseHora);

        // Determinar el monto exacto esperado en la transferencia
        const expectedTransferAmount =
          metodoPago === 'mixto' && ctx.session.mixedTransferAmount
            ? ctx.session.mixedTransferAmount
            : totalBase;

        const analysis = await this.aiMessageService.analyzeReceipt(
          stored.sourceUrl,
          expectedTransferAmount,
        );
        const accounts = await this.authorizedBankAccountsRepository.find({
          where: { activa: true },
        });
        const receipt = validateReceiptAnalysis(
          analysis,
          expectedTransferAmount,
          accounts,
        );
        const telegramId = ctx.from!.id.toString();
        const jefe = await this.findAssignedJefe(empleada);
        validation = await this.finishReceiptValidation(
          validation,
          analysis,
          receipt,
          {
            jefeId: jefe?.id,
            draftPayload: receipt.needsManualReview
              ? {
                  clientId: client.id,
                  empleadaId,
                  duracionPactadaHoras,
                  metodoPago,
                  locationLat,
                  locationLng,
                  locationNotas: locationNotas || null,
                  telegramId,
                }
              : null,
          },
        );

        await ctx.telegram
          .deleteMessage(ctx.chat!.id, processingMsg.message_id)
          .catch(() => {});

        if (receipt.needsManualReview) {
          await ctx.reply(
            'Tu comprobante quedó en revisión manual. En breve un asesor lo validará y te avisamos.',
          );
          if (jefe) {
            const caption =
              `Comprobante en revisión manual\n\n` +
              `Cliente: ${client.nombreTelegram || 'Desconocido'}\n` +
              `Monto esperado: $${expectedTransferAmount.toFixed(2)}\n` +
              `Monto leído: $${receipt.amount != null ? receipt.amount.toFixed(2) : 'N/D'}\n` +
              `Banco destino: ${validation.bancoDestino || 'N/D'}\n` +
              `Titular destino: ${validation.titularDestino || 'N/D'}\n` +
              `Motivo: ${receipt.reason}`;
            const target = jefe.grupoTelegramId || jefe.telegramChatId;
            if (target) {
              await ctx.telegram
                .sendPhoto(target, validation.telegramFileId || fileId, {
                  caption,
                  ...Markup.inlineKeyboard([
                    [
                      Markup.button.callback(
                        '🟢 Aprobar',
                        `receipt_autorizar:${validation.id}:1`,
                      ),
                      Markup.button.callback(
                        '🔴 Rechazar',
                        `receipt_autorizar:${validation.id}:0`,
                      ),
                    ],
                  ]),
                })
                .catch((err) =>
                  this.logger.error('No se pudo notificar al jefe:', err),
                );
            }
          }
          return;
        }

        if (!receipt.valid) {
          await ctx.reply(
            `⚠️ Problema con el comprobante:\n\n${receipt.reason || 'El comprobante no parece ser válido.'}\n\nPor favor intenta enviar otro o avísanos si necesitas ayuda.`,
          );
          return;
        }

        await ctx.reply('✅ ¡Comprobante verificado correctamente!');

        await this.finalizeBooking(
          ctx,
          client,
          empleada,
          duracionPactadaHoras,
          metodoPago,
          locationLat,
          locationLng,
          locationNotas || null,
          telegramId,
          validation.id,
        );
      } catch (err) {
        await this.markReceiptValidationError(validation, err);
        console.error('Error procesando comprobante:', err);
        await ctx.reply(
          'Ocurrió un error verificando el comprobante. Intentaremos revisarlo manualmente.',
        );
      }
    }
  }

  @Action(/^conf_fin_serv:(.+)$/)
  async onConfFinalizarServicio(@Ctx() ctx: Context) {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const match = (ctx as any).match;
    if (!match) return;
    const servicioId = match[1];

    const servicio = await this.serviciosRepository.findOne({
      where: { id: servicioId },
      relations: {
        cliente: true,
        empleada: { usuario: true, jefe: true },
        jefe: true,
      },
    });

    if (!servicio) {
      await ctx.answerCbQuery('❌ Servicio no encontrado.', {
        show_alert: true,
      });
      return;
    }

    if (!(await this.isAssignedEmployee(ctx, servicio))) {
      await ctx.answerCbQuery('No puedes modificar este servicio.', {
        show_alert: true,
      });
      return;
    }

    if (servicio.serviceType === 'grupal') {
      try {
        const finished = await this.groupServicesService.finishByResponsible(
          servicio.id,
          telegramId,
        );
        await ctx.answerCbQuery('Servicio grupal finalizado');
        await ctx.editMessageText(
          `Servicio grupal finalizado\n\nDuración real: ${Number(finished?.duracionFinalHoras ?? 0).toFixed(2)} horas\nTotal del grupo: $${Number(finished?.totalFinal ?? 0).toFixed(2)}\nParticipantes: ${finished?.participantes?.filter((item) => item.status !== 'cancelada').length ?? 0}`,
        );
        if (finished?.cliente?.telegramChatId) {
          for (const participant of finished.participantes?.filter(
            (item) => item.status !== 'cancelada',
          ) ?? []) {
            await ctx.telegram.sendMessage(
              finished.cliente.telegramChatId,
              `Califica individualmente a ${participant.employee?.nombreArtistico ?? 'la empleada'}:`,
              Markup.inlineKeyboard([
                [1, 2, 3, 4, 5].map((stars) =>
                  Markup.button.callback(
                    `${stars} ⭐`,
                    `g_rate:${finished.id.slice(0, 8)}:${participant.employeeId.slice(0, 8)}:${stars}`,
                  ),
                ),
              ]),
            );
          }
        }
      } catch (error: any) {
        await ctx.answerCbQuery(
          error.message || 'No se pudo finalizar el servicio',
          { show_alert: true },
        );
      }
      return;
    }

    if (servicio.estado !== 'en_curso') {
      await ctx.answerCbQuery('Este servicio ya no está activo.', {
        show_alert: true,
      });
      return;
    }

    // Cambiar estado a finalizado
    servicio.estado = 'finalizado';
    const fin = new Date();
    servicio.horaFinServicio = fin;

    // Calcular duración real en horas y formato legible (horas, minutos, segundos)
    let duracionRealVal = servicio.duracionPactadaHoras;
    let duracionFormatted = `${servicio.duracionPactadaHoras} horas`;
    if (servicio.horaInicioServicio) {
      const inicio = new Date(servicio.horaInicioServicio);
      const diffMs = fin.getTime() - inicio.getTime();
      duracionRealVal = diffMs / (1000 * 60 * 60);

      const totalSeconds = Math.floor(diffMs / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      const parts: string[] = [];
      if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hora' : 'horas'}`);
      if (minutes > 0)
        parts.push(`${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`);
      if (seconds > 0 || parts.length === 0)
        parts.push(`${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`);
      duracionFormatted = parts.join(', ');
    }
    servicio.duracionFinalHoras = Number(duracionRealVal.toFixed(2));
    servicio.estadoLiquidacion = 'transporte_pendiente';
    servicio.recordatoriosRegreso = 0;
    servicio.proximoRecordatorioRegresoAt = new Date(Date.now() + 5 * 60_000);
    await this.serviciosRepository.save(servicio);
    const successor = await this.servicesService.activateScheduledSuccessor(
      servicio.id,
    );
    if (successor.hasSuccessor) {
      servicio.estadoLiquidacion = 'cerrada';
      servicio.proximoRecordatorioRegresoAt = null;
      await this.serviciosRepository.save(servicio);
    }
    this.realtimeEventsService.emitToJefes({
      type: 'employee_availability_updated',
      empleadaId: servicio.empleadaId,
      completedServiceId: servicio.id,
      hasScheduledSuccessor: successor.hasSuccessor,
    });

    const servicioConTotal =
      (await this.serviciosRepository.findOne({
        where: { id: servicio.id },
      })) ?? servicio;

    const empleadaPromise = (async () => {
      try {
        if (servicio.empleadaId && !successor.hasSuccessor) {
          await this.empleadasRepository.update(servicio.empleadaId, {
            disponible: true,
          });
        }
      } catch (err) {
        console.error(
          'Error al actualizar disponibilidad de la empleada:',
          err,
        );
      }
    })();

    await Promise.allSettled([empleadaPromise]);

    await ctx.answerCbQuery('🏁 Servicio finalizado con éxito.');

    const totalFinal = Number(servicioConTotal.totalFinal);
    const cargoTransporte = Number(
      servicioConTotal.customerTransportCharge ??
        servicioConTotal.totalTransporte ??
        0,
    );
    const formatoMoneda = new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    });
    const resumenEmpText =
      `*Actividad con el cliente finalizada*\n\n` +
      `• *Cliente:* ${servicio.cliente?.nombreTelegram || 'Desconocido'}\n` +
      `• *Duración Real:* ${duracionFormatted}\n` +
      `• *Servicio pactado:* ${formatoMoneda.format(Number(servicioConTotal.totalBase))}\n` +
      (cargoTransporte > 0
        ? `• *Cargo de transporte:* ${formatoMoneda.format(cargoTransporte)}\n`
        : `• *Cargo de transporte:* Sin costo\n`) +
      `• *Método de pago:* ${servicioConTotal.metodoPago.toUpperCase()}\n\n` +
      `*Total que debes cobrar al cliente: ${formatoMoneda.format(totalFinal)}*`;

    try {
      await ctx.editMessageText(resumenEmpText, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('Error al editar mensaje de cierre de actividad:', err);
    }
    await ctx.reply(
      'Califica tu interacción con el cliente.',
      Markup.inlineKeyboard([
        [1, 2, 3, 4, 5].map((stars) =>
          Markup.button.callback(
            `${stars}`,
            `rate_client_service:${servicio.id}:${stars}`,
          ),
        ),
        [
          Markup.button.callback(
            'Reportar al cliente',
            `conduct_employee_client:${servicio.id}`,
          ),
        ],
      ]),
    );

    // 2. Limpieza de chat del cliente (Eliminar mensaje anterior) y enviar solicitud de calificación
    if (servicio.cliente?.telegramChatId) {
      if (servicio.telegramClienteMensajeId) {
        try {
          await ctx.telegram.deleteMessage(
            servicio.cliente.telegramChatId,
            parseInt(servicio.telegramClienteMensajeId, 10),
          );
        } catch (err) {
          console.error('Error al eliminar mensaje del cliente:', err);
        }
      }

      try {
        const ratingKeyboard = Markup.inlineKeyboard([
          ...[1, 2, 3, 4, 5].map((rating) => [
            Markup.button.callback(
              `${rating} - ${'⭐'.repeat(rating)}`,
              `calificar_servicio:${servicio.id}:${rating}`,
            ),
          ]),
          [
            Markup.button.callback(
              '⚠️ Reportar empleada',
              `er_client_start:${servicio.id}`,
            ),
          ],
        ]);
        await ctx.telegram.sendMessage(
          servicio.cliente.telegramChatId,
          `✨ *El servicio con ${servicio.empleada?.nombreArtistico || 'la empleada'} ha finalizado.*\n\nPor favor, tómate un momento para calificar tu experiencia:`,
          { parse_mode: 'Markdown', ...ratingKeyboard },
        );
      } catch (err) {
        console.error(
          'Error al enviar la solicitud de calificación al cliente:',
          err,
        );
      }
    }

    if (!successor.hasSuccessor) {
      try {
        await this.servicesService.requestReturnTransport(servicio.id);
      } catch (err) {
        console.error('Error al solicitar transporte de regreso:', err);
      }
    }
  }

  @Action(/^rate_driver_trip:(.+):([1-5])$/)
  async onEmployeeRatesDriver(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    await this.handleEmployeeRating(
      ctx,
      'employee_to_driver',
      (ctx as any).match[1],
      Number((ctx as any).match[2]),
    );
  }

  @Action(/^rate_client_service:(.+):([1-5])$/)
  async onEmployeeRatesClient(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    await this.handleEmployeeRating(
      ctx,
      'employee_to_client',
      (ctx as any).match[1],
      Number((ctx as any).match[2]),
    );
  }

  private async handleEmployeeRating(
    ctx: BotContext,
    direction: 'employee_to_driver' | 'employee_to_client',
    interactionId: string,
    stars: number,
  ) {
    if (stars <= 2) {
      ctx.session ||= {};
      ctx.session.step = 'AWAITING_EMPLOYEE_DRIVER_RATING_COMMENT';
      ctx.session.disciplineDirection = direction;
      ctx.session.disciplineStars = stars;
      if (direction === 'employee_to_driver') {
        ctx.session.disciplineTripId = interactionId;
      } else {
        ctx.session.disciplineServiceId = interactionId;
      }
      await ctx.reply(
        'Para una o dos estrellas, escribe un comentario con el motivo.',
      );
      return;
    }
    const user = await this.usuariosRepository.findOne({
      where: { telegramChatId: ctx.from!.id.toString(), rol: 'empleada' },
    });
    if (!user) {
      await ctx.reply('No fue posible validar tu perfil de empleada.');
      return;
    }
    await this.disciplineService.createRating(
      { id: user.id, rol: 'empleada' },
      { direction, interactionId, stars },
    );
    await ctx.editMessageReplyMarkup(undefined);
    await ctx.reply('Calificación registrada. Gracias por tu opinión.');
  }

  @Action(/^conduct_employee_(client|driver):(.+)$/)
  async onEmployeeConductStart(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    ctx.session ||= {};
    const target = (ctx as any).match[1] as 'client' | 'driver';
    ctx.session.step = 'AWAITING_EMPLOYEE_CONDUCT_DESCRIPTION';
    ctx.session.disciplineDirection =
      target === 'client' ? 'employee_to_client' : 'employee_to_driver';
    if (target === 'client') {
      ctx.session.disciplineServiceId = (ctx as any).match[2];
    } else {
      ctx.session.disciplineTripId = (ctx as any).match[2];
    }
    await ctx.reply('Describe brevemente la conducta que deseas reportar.');
  }

  @Action(/^canc_fin_serv:(.+)$/)
  async onCancFinalizarServicio(@Ctx() ctx: Context) {
    await ctx.answerCbQuery('Cancelado.');
    const match = (ctx as any).match;
    if (!match) return;
    const servicioId = match[1];

    const servicio = await this.serviciosRepository.findOne({
      where: { id: servicioId },
    });

    let originalText = (ctx.callbackQuery?.message as any)?.text || '';
    // Limpiar el encabezado de advertencia si existe
    originalText = originalText.replace(
      /⚠️ \*?¿Confirmas que deseas FINALIZAR este servicio\? Esta acción no se puede deshacer\.\*?\n\n/,
      '',
    );

    const inlineButtons: any[] = [
      [
        Markup.button.callback(
          '🏁 Finalizar Servicio',
          `finalizar_servicio:${servicioId}`,
        ),
      ],
    ];

    inlineButtons.push([
      Markup.button.callback(
        '➕ Agregar Extra',
        `agregar_extra_list:${servicioId}`,
      ),
    ]);

    await ctx.editMessageText(originalText, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(inlineButtons),
    });
  }

  @Action(/^calificar_servicio:(.+):([1-5])$/)
  async onCalificarServicio(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    const match = (ctx as any).match;
    if (!match) return;
    const servicioId = match[1];
    const rating = parseInt(match[2], 10);

    const servicio = await this.serviciosRepository.findOne({
      where: { id: servicioId },
    });

    if (!servicio) {
      await ctx.reply('❌ Servicio no encontrado.');
      return;
    }

    const stars = '⭐'.repeat(rating);

    if (rating >= 3) {
      const client = await this.clientesRepository.findOne({
        where: { telegramChatId: ctx.from!.id.toString() },
      });
      if (!client) {
        await ctx.reply('No fue posible identificar al cliente.');
        return;
      }
      await this.disciplineService.createClientRating(client.id, {
        direction: 'client_to_employee',
        interactionId: servicioId,
        stars: rating,
      });
      servicio.calificacion = rating;
      await this.serviciosRepository.save(servicio);
      await ctx.editMessageText(
        `Muchas gracias por calificar con ${stars} el servicio de nuestra empleada. ¡Agradecemos tu preferencia!`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              '⚠️ Reportar empleada',
              `er_client_start:${servicioId}`,
            ),
          ],
        ]),
      );
      await ctx.reply('¡Agradecemos tu preferencia!', Markup.removeKeyboard());
    } else {
      if (!ctx.session) {
        ctx.session = {};
      }
      ctx.session.step = 'AWAITING_RATING_COMMENT';
      ctx.session.servicioIdCalificacion = servicioId;
      ctx.session.pendingRating = rating;

      await ctx.editMessageText(
        `Has calificado con ${stars} nuestro servicio.\n\n` +
          `⚠️ *Comentario Obligatorio:*\n` +
          `Lamentamos mucho tu insatisfacción. Por favor, escribe un comentario directamente en el chat explicándonos qué podemos mejorar:`,
        { parse_mode: 'Markdown' },
      );
    }
  }

  @Action(/^g_rate:([0-9a-f]{8}):([0-9a-f]{8}):([1-5])$/)
  async onCalificarParticipanteGrupal(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    const match = (ctx as any).match;
    if (!match) return;
    const [services, employees] = await Promise.all([
      this.serviciosRepository
        .createQueryBuilder('service')
        .where('service.id::text LIKE :prefix', { prefix: `${match[1]}%` })
        .andWhere('service.serviceType = :type', { type: 'grupal' })
        .getMany(),
      this.empleadasRepository
        .createQueryBuilder('employee')
        .where('employee.id::text LIKE :prefix', { prefix: `${match[2]}%` })
        .getMany(),
    ]);
    if (services.length !== 1 || employees.length !== 1) {
      await ctx.reply('No fue posible identificar esta calificación.');
      return;
    }
    const client = await this.clientesRepository.findOne({
      where: { telegramChatId: ctx.from!.id.toString() },
    });
    if (!client) {
      await ctx.reply('No fue posible identificar al cliente.');
      return;
    }
    const stars = Number(match[3]);
    if (stars <= 2) {
      ctx.session ??= {};
      ctx.session.step = 'AWAITING_RATING_COMMENT';
      ctx.session.servicioIdCalificacion = services[0].id;
      ctx.session.groupRatingEmployeeId = employees[0].id;
      ctx.session.pendingRating = stars;
      await ctx.editMessageText(
        `Has calificado con ${'⭐'.repeat(stars)} a ${employees[0].nombreArtistico}.\n\nPor favor, escribe un comentario indicando qué podemos mejorar.`,
      );
      return;
    }
    await this.disciplineService.createClientRating(client.id, {
      direction: 'client_to_employee',
      interactionId: services[0].id,
      employeeId: employees[0].id,
      stars,
    });
    await ctx.editMessageText(
      `Gracias por calificar a ${employees[0].nombreArtistico} con ${'⭐'.repeat(stars)}.`,
    );
  }

  private reportCategoryLabel(category: ReportCategory): string {
    return (
      {
        trato_inadecuado: 'Trato inadecuado',
        demora_impuntualidad: 'Demora o impuntualidad',
        incumplimiento: 'Incumplimiento',
        cobro: 'Cobro',
        seguridad: 'Seguridad',
        otro: 'Otro',
      } as Record<ReportCategory, string>
    )[category];
  }

  private reportCategoryKeyboard(serviceId: string) {
    const categories: ReportCategory[] = [
      'trato_inadecuado',
      'demora_impuntualidad',
      'incumplimiento',
      'cobro',
      'seguridad',
      'otro',
    ];
    return Markup.inlineKeyboard([
      ...categories.map((category) => [
        Markup.button.callback(
          this.reportCategoryLabel(category),
          buildReportCategoryCallback('client', serviceId, category),
        ),
      ]),
      [Markup.button.callback('❌ Cancelar', 'er_client_cancel')],
    ]);
  }

  @Action(/^er_client_start:(.+)$/)
  async onClientReportStart(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    const serviceId = (ctx as any).match?.[1];
    if (!serviceId) return;
    await ctx.reply(
      'Selecciona la categoría que mejor describe lo ocurrido:',
      this.reportCategoryKeyboard(serviceId),
    );
  }

  @Action(/^erc:([^:]+):([tdicso])$/)
  async onClientReportCategory(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    const match = (ctx as any).match;
    ctx.session = ctx.session || {};
    const category = parseReportCategoryCode(match[2]);
    if (!category) {
      await ctx.reply('La categoría seleccionada no es válida.');
      return;
    }
    ctx.session.step = 'AWAITING_CLIENT_REPORT_DESCRIPTION';
    ctx.session.reportServiceId = match[1];
    ctx.session.reportCategory = category;
    delete ctx.session.reportDescription;
    await ctx.reply(
      `Describe brevemente lo ocurrido para la categoría “${this.reportCategoryLabel(ctx.session.reportCategory)}”.`,
    );
  }

  @Action('er_client_confirm')
  async onClientReportConfirm(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery();
    const telegramId = ctx.from?.id.toString();
    const session = ctx.session;
    if (
      !telegramId ||
      !session?.reportServiceId ||
      !session.reportCategory ||
      !session.reportDescription
    ) {
      await ctx.reply(
        'La sesión del reporte expiró. Inicia el proceso nuevamente.',
      );
      return;
    }
    try {
      await this.employeeReportsService.createFromClient(
        telegramId,
        session.reportServiceId,
        session.reportCategory,
        session.reportDescription,
      );
      ctx.session = {};
      await ctx.editMessageText(
        '✅ Recibimos tu reporte. Un administrador lo revisará.',
      );
    } catch (error: any) {
      await ctx.reply(
        `No fue posible registrar el reporte: ${error?.message || 'intenta nuevamente'}`,
      );
    }
  }

  @Action('er_client_cancel')
  async onClientReportCancel(@Ctx() ctx: BotContext) {
    await ctx.answerCbQuery('Reporte cancelado');
    ctx.session = {};
    await ctx.editMessageText('Reporte cancelado.');
  }

  @On(['location', 'venue', 'edited_message'])
  async onLocation(
    @Ctx() ctx: BotContext,
    selectedLocation?: {
      latitude: number;
      longitude: number;
      title: string;
      address: string;
    },
  ) {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const message = selectedLocation
      ? undefined
      : ctx.message || ctx.editedMessage || (ctx.update as any).edited_message;
    if (!selectedLocation && !message) return;

    let lat: string;
    let lng: string;
    let notasUbicacion: string | null = null;

    if (selectedLocation) {
      lat = selectedLocation.latitude.toString();
      lng = selectedLocation.longitude.toString();
      notasUbicacion = `Lugar seleccionado: ${selectedLocation.title}\nDirección: ${selectedLocation.address}`;
    } else if (message?.venue) {
      const venue = message.venue;
      lat = venue.location.latitude.toString();
      lng = venue.location.longitude.toString();
      notasUbicacion = `Lugar seleccionado: ${venue.title}\nDirección: ${venue.address}`;
    } else if (message?.location) {
      const location = message.location;
      lat = location.latitude.toString();
      lng = location.longitude.toString();
    } else {
      return;
    }

    const isEdited = !!(
      ctx.editedMessage || (ctx.update as any).edited_message
    );

    // Check in-memory cache to throttle database operations completely
    const nowTime = Date.now();
    const cached = this.userLocationCache.get(telegramId);
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);

    if (
      !Number.isFinite(parsedLat) ||
      !Number.isFinite(parsedLng) ||
      parsedLat < -90 ||
      parsedLat > 90 ||
      parsedLng < -180 ||
      parsedLng > 180
    ) {
      await ctx.reply('No pude reconocer unas coordenadas válidas.');
      return;
    }

    if (cached) {
      const diffMs = nowTime - cached.lastSaved;
      const distanceMeters = this.getDistanceMeters(
        cached.lat,
        cached.lng,
        parsedLat,
        parsedLng,
      );

      // Throttling: Skip database read/write if within 60s AND has moved less than 50 meters
      if (diffMs < 60000 && distanceMeters < 50) {
        if (cached.rol === 'empleada') {
          await this.usuariosRepository.manager.update(Empleadas, cached.id, {
            ubicacionLat: parsedLat,
            ubicacionLng: parsedLng,
            ultimaUbicacionAt: new Date(),
          });
          cached.lat = parsedLat;
          cached.lng = parsedLng;
          cached.lastSaved = nowTime;
          cached.dirty = false;
          this.realtimeEventsService.emitToJefes({
            type: 'EMPLOYEE_LOCATION_UPDATE',
            empleadaId: cached.id,
            lat: parsedLat,
            lng: parsedLng,
          });
          if (!isEdited) {
            await ctx.reply(
              `📍 Ubicación registrada para la empleada: ${cached.name}.`,
            );
          }
          return;
        }

        // Update ONLY in-memory coordinates in cache
        cached.lat = parsedLat;
        cached.lng = parsedLng;
        cached.dirty = true; // Mark as dirty since cache is ahead of DB

        // Broadcast SSE update immediately using cached/updated details
        this.realtimeEventsService.emitToJefes({
          type:
            cached.rol === 'chofer'
              ? 'DRIVER_LOCATION_UPDATE'
              : 'EMPLOYEE_LOCATION_UPDATE',
          choferId: cached.rol === 'chofer' ? cached.id : undefined,
          empleadaId: cached.rol === 'empleada' ? cached.id : undefined,
          lat: parsedLat,
          lng: parsedLng,
        });
        return;
      }

      // Throttle expired (toca escribir a DB) pero YA está en cache: NO findOne, actualizar DB directo
      try {
        if (cached.rol === 'chofer') {
          await this.usuariosRepository.manager.update(Choferes, cached.id, {
            ubicacionLat: parsedLat,
            ubicacionLng: parsedLng,
            ultimaUbicacionAt: new Date(),
          });
          // Update cache details
          cached.lat = parsedLat;
          cached.lng = parsedLng;
          cached.lastSaved = nowTime;
          cached.dirty = false;

          // Emit real-time event to Jefes/Dashboard
          this.realtimeEventsService.emitToJefes({
            type: 'DRIVER_LOCATION_UPDATE',
            choferId: cached.id,
            lat: parsedLat,
            lng: parsedLng,
          });
        } else if (cached.rol === 'empleada') {
          await this.usuariosRepository.manager.update(Empleadas, cached.id, {
            ubicacionLat: parsedLat,
            ubicacionLng: parsedLng,
            ultimaUbicacionAt: new Date(),
          });
          // Update cache details
          cached.lat = parsedLat;
          cached.lng = parsedLng;
          cached.lastSaved = nowTime;
          cached.dirty = false;

          // Emit real-time event to Jefes/Dashboard
          this.realtimeEventsService.emitToJefes({
            type: 'EMPLOYEE_LOCATION_UPDATE',
            empleadaId: cached.id,
            lat: parsedLat,
            lng: parsedLng,
          });
          if (!isEdited) {
            await ctx.reply(
              `📍 Ubicación registrada para la empleada: ${cached.name}.`,
            );
          }
        }
        return;
      } catch (err) {
        this.logger.error(
          `Error updating location directly for telegramId=${telegramId}:`,
          err,
        );
      }
    }

    // Si cached es undefined: Primera vez que se ve ese telegramId. Sí buscar en DB con relaciones.
    const user = await this.usuariosRepository.findOne({
      where: { telegramChatId: telegramId },
      relations: { choferes: true, empleadas: true },
    });

    if (user) {
      if (user.rol === 'chofer' && user.choferes) {
        user.choferes.ubicacionLat = parsedLat;
        user.choferes.ubicacionLng = parsedLng;
        user.choferes.ultimaUbicacionAt = new Date();
        await this.usuariosRepository.manager.save(user.choferes);

        // Cache user info
        this.userLocationCache.set(telegramId, {
          id: user.choferes.id,
          rol: 'chofer',
          name: user.choferes.nombre,
          lat: parsedLat,
          lng: parsedLng,
          lastSaved: nowTime,
          dirty: false,
        });

        // Emit real-time event to Jefes/Dashboard
        this.realtimeEventsService.emitToJefes({
          type: 'DRIVER_LOCATION_UPDATE',
          choferId: user.choferes.id,
          lat: user.choferes.ubicacionLat,
          lng: user.choferes.ubicacionLng,
        });

        // Solo notificar si no estaba en caché (primera vez) y no está editada
        if (!isEdited) {
          await ctx.reply(
            `📍 Ubicación registrada para el chofer: ${user.choferes.nombre}.`,
          );
        }
        return;
      }

      if (user.rol === 'empleada' && user.empleadas) {
        user.empleadas.ubicacionLat = parsedLat;
        user.empleadas.ubicacionLng = parsedLng;
        user.empleadas.ultimaUbicacionAt = new Date();
        await this.usuariosRepository.manager.save(user.empleadas);

        // Cache user info
        this.userLocationCache.set(telegramId, {
          id: user.empleadas.id,
          rol: 'empleada',
          name: user.empleadas.nombreArtistico,
          lat: parsedLat,
          lng: parsedLng,
          lastSaved: nowTime,
          dirty: false,
        });

        // Emit real-time event to Jefes/Dashboard
        this.realtimeEventsService.emitToJefes({
          type: 'EMPLOYEE_LOCATION_UPDATE',
          empleadaId: user.empleadas.id,
          lat: user.empleadas.ubicacionLat,
          lng: user.empleadas.ubicacionLng,
        });

        // Solo notificar si no estaba en caché (primera vez) y no está editada
        if (!isEdited) {
          await ctx.reply(
            `📍 Ubicación registrada para la empleada: ${user.empleadas.nombreArtistico}.`,
          );
        }
        return;
      }
    } else {
      this.logger.log(`No system user found for telegramChatId=${telegramId}`);
    }

    if (ctx.chat?.type === 'private') {
      const groupRequest =
        await this.groupServicesService.findActiveRequestByClientTelegram(
          telegramId,
        );
      if (groupRequest && !groupRequest.serviceId) {
        await this.groupServicesService.setLocationFromClient(
          groupRequest.id,
          parsedLat,
          parsedLng,
        );
        await ctx.reply(
          'Ubicación recibida. El jefe ya puede verla en el organizador del servicio.',
          Markup.removeKeyboard(),
        );
        return;
      }
    }

    // Si no es personal, continuar flujo de cliente
    // Helper: escape Markdown v1 special characters so Telegram doesn't choke
    const escapeMd = (text: string): string =>
      text
        .replace(/\n/g, ' ') // newlines → space (critical for inline fields)
        .replace(/([_*[`])/g, '\\$1'); // escape Markdown special chars
    const step = ctx.session?.step;
    if (step !== 'AWAITING_LOCATION') {
      await ctx.reply(
        'Por favor, inicia la contratación de una empleada desde el catálogo primero.',
      );
      return;
    }
    await this.recordDraftConversation(
      ctx,
      'cliente',
      notasUbicacion ||
        `Ubicación compartida: ${parsedLat.toFixed(6)}, ${parsedLng.toFixed(6)}`,
    );

    // Sanitize notasUbicacion so it is safe to embed in Markdown messages
    const notasUbicacionSafe = notasUbicacion ? escapeMd(notasUbicacion) : null;

    // Guardamos la ubicación en la sesión
    if (ctx.session) {
      ctx.session.locationLat = lat;
      ctx.session.locationLng = lng;
      ctx.session.locationNotas = notasUbicacion;
    }

    try {
      const { empleadaId, duracionPactadaHoras } = ctx.session || {};

      if (!empleadaId || !duracionPactadaHoras) {
        await ctx.reply(
          '❌ Datos incompletos del proceso. Por favor inicia nuevamente.',
        );
        if (ctx.session) ctx.session = {};
        return;
      }

      const client = await this.clientesRepository.findOne({
        where: { telegramChatId: telegramId },
      });

      if (!client) {
        await ctx.reply(
          '❌ Cliente no encontrado. Por favor inicia con /start',
        );
        ctx.session = {};
        return;
      }

      const empleada = await this.empleadasRepository.findOne({
        where: { id: empleadaId },
      });

      if (!empleada) {
        await ctx.reply('La empleada seleccionada ya no está disponible.');
        ctx.session = {};
        return;
      }

      const totalBase = duracionPactadaHoras * Number(empleada.precioBaseHora);
      const transportCharge = Number(ctx.session?.customerTransportCharge ?? 0);
      const total = totalBase + transportCharge;

      if (!ctx.session) ctx.session = {};
      const formatoMoneda = new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
      });

      let priceMsg = '';
      if (transportCharge > 0) {
        priceMsg = `Por las ${duracionPactadaHoras} horas conmigo serían *${formatoMoneda.format(totalBase)}*, más *${formatoMoneda.format(transportCharge)}* del transporte a tu ubicación.\n\nEn total serían *${formatoMoneda.format(total)}* amor.`;
      } else {
        priceMsg = `Por las ${duracionPactadaHoras} horas conmigo serían *${formatoMoneda.format(totalBase)}* en total, sin costo extra de transporte mor.`;
      }

      if (ctx.session.metodoPago) {
        const metodoPrevio = ctx.session.metodoPago;
        priceMsg += `\n\nQuedamos en pago por *${metodoPrevio.toUpperCase()}*.`;
        await this.sendDelayedReply(ctx, priceMsg);
        await this.applyDraftPaymentMethod(ctx, metodoPrevio);
        return;
      }

      ctx.session.step = 'AWAITING_PAYMENT_METHOD';
      priceMsg += `\n\nDime amor, ¿cómo prefieres pagar?`;

      await ctx.sendChatAction('typing').catch(() => {});
      const delayMs = 2000 + Math.floor(Math.random() * 1000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      await ctx.reply(priceMsg, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('Efectivo', 'pago_efectivo'),
            Markup.button.callback('Tarjeta', 'pago_tarjeta'),
          ],
          [
            Markup.button.callback('Transferencia', 'pago_transferencia'),
            Markup.button.callback('Mixto (Efectivo y Digital)', 'pago_mixto'),
          ],
        ]),
      });
      return;
    } catch (bookingErr) {
      this.logger.error(
        'Error crítico en flujo de contratación (onLocation):',
        bookingErr,
      );
      if (ctx.session) ctx.session = {};
      try {
        await ctx.reply(
          '⚠️ Ocurrió un error al procesar tu solicitud. Por favor, intenta de nuevo desde el catálogo.',
          Markup.removeKeyboard(),
        );
      } catch {
        // La sesion ya fue limpiada; no hay otra accion de recuperacion.
      }
    }
  }

  async finalizeBooking(
    ctx: BotContext,
    client: Clientes,
    empleada: Empleadas,
    duracionPactadaHoras: number,
    metodoPago: 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto',
    lat: string,
    lng: string,
    notasUbicacion: string | null,
    telegramId: string,
    receiptValidationId?: string,
  ): Promise<Servicios | undefined> {
    try {
      const escapeMd = (text: string): string =>
        text.replace(/\n/g, ' ').replace(/([_*[`])/g, '\\$1');
      const notasUbicacionSafe = notasUbicacion
        ? escapeMd(notasUbicacion)
        : null;

      const jefe = await this.findAssignedJefe(empleada);

      if (!jefe) {
        await ctx.reply(
          '❌ No hay ningún jefe o administrador activo asignado en el sistema en este momento para autorizar el servicio.',
        );
        return;
      }
      const jefeId = jefe.id;
      const isEncadenado = false;
      const servicioPrevioId: string | undefined = undefined;

      // ─── FLUJO ENCADENADO ───────────────────────────────────────────────────
      if (isEncadenado) {
        const nuevoServicioEnc: any = this.serviciosRepository.create({
          clienteId: client.id,
          empleadaId: empleada.id,
          jefeId: jefeId,
          duracionPactadaHoras: duracionPactadaHoras,
          metodoPago: metodoPago,
          ubicacionClienteLat: parseFloat(lat),
          ubicacionClienteLng: parseFloat(lng),
          precioBaseHoraPactado: empleada.precioBaseHora,
          estado: 'cancelado',
          notas: notasUbicacion,
          servicioPrevioId: servicioPrevioId || null,
          clienteTelegramId: telegramId,
          iaActiva: false,
          presetLocationId: ctx.session?.presetLocationId ?? null,
          locationNameSnapshot: ctx.session?.locationNameSnapshot ?? null,
          locationAddressSnapshot: ctx.session?.locationAddressSnapshot ?? null,
          customerTransportCharge: ctx.session?.customerTransportCharge ?? 0,
          totalTransporte: ctx.session?.customerTransportCharge ?? 0,
        } as any);
        // 1. SAVE INICIAL (INSERT)
        await this.serviciosRepository.save(nuevoServicioEnc);
        if (receiptValidationId) {
          await this.paymentReceiptValidationsRepository.update(
            receiptValidationId,
            { servicioId: nuevoServicioEnc.id },
          );
        }

        const jefeUser = await this.usuariosRepository.findOne({
          where: { id: jefeId },
        });
        if (jefeUser && jefeUser.grupoTelegramId) {
          try {
            const clientName =
              client.nombreTelegram || ctx.from?.first_name || 'Cliente';
            const topic = await ctx.telegram.createForumTopic(
              jefeUser.grupoTelegramId,
              `👤 Cliente: ${clientName}`,
            );
            // Acumulamos en memoria y guardamos en DB
            nuevoServicioEnc.telegramThreadId =
              topic.message_thread_id.toString();
            await this.serviciosRepository.save(nuevoServicioEnc);

            const detailsMsg =
              `📋 *Información del Servicio (Cita Encadenada):*\n\n` +
              `• *Cliente:* ${clientName} (ID: ${telegramId})\n` +
              `• *Empleada:* ${empleada.nombreArtistico}\n` +
              `• *Duración:* ${duracionPactadaHoras} horas\n` +
              `• *Método de Pago:* ${metodoPago.toUpperCase()}\n` +
              `• *Tarifa:* $${empleada.precioBaseHora}/hr\n` +
              (notasUbicacionSafe
                ? `• *Ubicación/Notas:* ${notasUbicacionSafe}\n`
                : '') +
              `• *Estado:* Pendiente Encadenada`;
            await ctx.telegram.sendMessage(
              jefeUser.grupoTelegramId,
              detailsMsg,
              {
                message_thread_id: topic.message_thread_id,
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                  [
                    Markup.button.callback(
                      '🟢 Aceptar',
                      `jefe_autorizar:${nuevoServicioEnc.id}:1`,
                    ),
                    Markup.button.callback(
                      '🔴 Rechazar',
                      `jefe_autorizar:${nuevoServicioEnc.id}:0`,
                    ),
                  ],
                ]),
              },
            );
            await ctx.telegram.sendLocation(
              jefeUser.grupoTelegramId,
              parseFloat(lat),
              parseFloat(lng),
              { message_thread_id: topic.message_thread_id },
            );
          } catch (err) {
            this.logger.error(
              'Error al crear forum topic para servicio encadenado:',
              err,
            );
          }
        }

        // Calculate estimated start time from the active service
        let horaEstimadaStr = 'próximamente';
        if (servicioPrevioId) {
          const servicioActivo = await this.serviciosRepository.findOne({
            where: { id: servicioPrevioId },
          });
          if (servicioActivo?.horaInicioServicio) {
            const estimada = new Date(
              servicioActivo.horaInicioServicio.getTime() +
                Number(servicioActivo.duracionPactadaHoras) * 60 * 60 * 1000,
            );
            // Acumulamos en memoria
            nuevoServicioEnc.horaInicioEstimada = estimada;
            horaEstimadaStr = estimada.toLocaleTimeString('es-MX', {
              hour: '2-digit',
              minute: '2-digit',
            });
          }
        }

        ctx.session = {};

        const msgEnc = 'Esta modalidad de reserva ya no está disponible.';

        const msgEnviadoEnc = await ctx.reply(msgEnc, {
          parse_mode: 'Markdown',
          ...Markup.removeKeyboard(),
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback(
                '❌ Cancelar esta Reserva',
                `cancelar_encadenado:${nuevoServicioEnc.id}`,
              ),
            ],
          ]),
        });

        // Acumulamos en memoria
        nuevoServicioEnc.telegramClienteMensajeId =
          msgEnviadoEnc.message_id.toString();

        // 2. SAVE FINAL CON TODOS LOS CAMBIOS ACUMULADOS
        await this.serviciosRepository.save(nuevoServicioEnc);

        // Notify jefe of new chained service
        try {
          await this.telegramService.notifyJefesNewService(nuevoServicioEnc.id);
        } catch (err) {
          console.error('Error notificando jefe sobre cita encadenada:', err);
        }

        return;
      }

      // ─── FLUJO NORMAL ────────────────────────────────────────────────────────
      const nuevoServicio = await this.servicesService.reserveNext({
        clienteId: client.id,
        empleadaId: empleada.id,
        jefeId: jefeId,
        duracionPactadaHoras: duracionPactadaHoras,
        metodoPago: metodoPago,
        ubicacionClienteLat: parseFloat(lat),
        ubicacionClienteLng: parseFloat(lng),
        precioBaseHoraPactado: empleada.precioBaseHora,
        estado: 'pendiente',
        notas: notasUbicacion,
        clienteTelegramId: telegramId,
        iaActiva: false,
        presetLocationId: ctx.session?.presetLocationId ?? null,
        locationNameSnapshot: ctx.session?.locationNameSnapshot ?? null,
        locationAddressSnapshot: ctx.session?.locationAddressSnapshot ?? null,
        customerTransportCharge: ctx.session?.customerTransportCharge ?? 0,
        totalTransporte: ctx.session?.customerTransportCharge ?? 0,
      });
      if (receiptValidationId) {
        await this.paymentReceiptValidationsRepository.update(
          receiptValidationId,
          { servicioId: nuevoServicio.id },
        );
      }

      const jefeUser = await this.usuariosRepository.findOne({
        where: { id: jefeId },
      });
      if (jefeUser && jefeUser.grupoTelegramId) {
        try {
          const clientName =
            client.nombreTelegram || ctx.from?.first_name || 'Cliente';
          const topic = await ctx.telegram.createForumTopic(
            jefeUser.grupoTelegramId,
            `👤 Cliente: ${clientName}`,
          );
          // Acumulamos en memoria y guardamos en DB
          nuevoServicio.telegramThreadId = topic.message_thread_id.toString();
          await this.serviciosRepository.save(nuevoServicio);
          await this.attachAndReplayDraftConversation(
            ctx,
            nuevoServicio,
            jefeUser.grupoTelegramId,
            topic.message_thread_id,
          );

          const detailsMsg =
            `📋 *Información del Servicio:*\n\n` +
            `• *Cliente:* ${clientName} (ID: ${telegramId})\n` +
            `• *Empleada:* ${empleada.nombreArtistico}\n` +
            `• *Duración:* ${duracionPactadaHoras} horas\n` +
            `• *Método de Pago:* ${metodoPago.toUpperCase()}\n` +
            `• *Tarifa:* $${empleada.precioBaseHora}/hr\n` +
            (notasUbicacionSafe
              ? `• *Ubicación/Notas:* ${notasUbicacionSafe}\n`
              : '') +
            `• *Estado:* ${nuevoServicio.servicioPrevioId ? 'Pendiente para agendar' : 'Pendiente'}` +
            (nuevoServicio.horaInicioEstimada
              ? `\n• *Llegada estimada:* ${nuevoServicio.horaInicioEstimada.toLocaleTimeString(
                  'es-MX',
                  {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'America/Mexico_City',
                  },
                )}`
              : '');
          await ctx.telegram.sendMessage(jefeUser.grupoTelegramId, detailsMsg, {
            message_thread_id: topic.message_thread_id,
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  '🟢 Aceptar',
                  `jefe_autorizar:${nuevoServicio.id}:1`,
                ),
                Markup.button.callback(
                  '🔴 Rechazar',
                  `jefe_autorizar:${nuevoServicio.id}:0`,
                ),
              ],
              [
                Markup.button.callback(
                  '✏️ Editar Servicio',
                  `jefe_editar_srv:${nuevoServicio.id}`,
                ),
              ],
            ]),
          });
          await ctx.telegram.sendLocation(
            jefeUser.grupoTelegramId,
            parseFloat(lat),
            parseFloat(lng),
            { message_thread_id: topic.message_thread_id },
          );
        } catch (err) {
          this.logger.error(
            'Error al crear forum topic para servicio normal:',
            err,
          );
        }
      }

      // Emit event to Jefes in real-time
      const serviceWithRelations = await this.serviciosRepository.findOne({
        where: { id: nuevoServicio.id },
        relations: { cliente: true, empleada: true },
      });
      if (serviceWithRelations) {
        this.realtimeEventsService.emitToBoss(serviceWithRelations.jefeId, {
          type: 'service_requested',
          data: serviceWithRelations,
        });

        try {
          await this.telegramService.notifyJefesNewService(
            serviceWithRelations.id,
          );
        } catch (err) {
          console.error(
            'Error al enviar notificaciones de Telegram para el nuevo servicio:',
            err,
          );
        }
      }

      const msgExito = await this.aiMessageService.generate(
        'booking_received',
        { employeeName: empleada.nombreArtistico },
        'Listo, dame un momentico y miro si puedo ir contigo',
      );

      const msg = await ctx.telegram.sendMessage(telegramId, msgExito, {
        ...Markup.removeKeyboard(),
      });
      await this.recordConversation(nuevoServicio, 'ia', msgExito);
      if (ctx.from?.id.toString() === telegramId) ctx.session = {};

      // Acumulamos en memoria
      nuevoServicio.telegramClienteMensajeId = msg.message_id.toString();
      // 2. SAVE FINAL CON TODOS LOS CAMBIOS ACUMULADOS
      await this.serviciosRepository.save(nuevoServicio);
      return nuevoServicio;
    } catch (bookingErr) {
      this.logger.error('Error crítico al finalizar reserva:', bookingErr);
      if (ctx.from?.id.toString() === telegramId && ctx.session)
        ctx.session = {};
      try {
        await ctx.telegram.sendMessage(
          telegramId,
          '⚠️ Ocurrió un error al procesar tu solicitud.',
          Markup.removeKeyboard(),
        );
      } catch {
        // La sesion ya fue limpiada; no hay otra accion de recuperacion.
      }
      return undefined;
    }
  }

  @Action(/^receipt_autorizar:([0-9a-f-]{36}):(0|1)$/)
  async onReceiptAutorizar(@Ctx() ctx: BotContext) {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const jefeUser = await this.usuariosRepository.findOne({
      where: { telegramChatId: telegramId },
    });
    if (!jefeUser || (jefeUser.rol !== 'jefe' && jefeUser.rol !== 'admin')) {
      await ctx.answerCbQuery(
        '❌ No tienes permisos para realizar esta acción.',
        { show_alert: true },
      );
      return;
    }

    const match = (ctx as any).match;
    const validationId = match[1];
    const approve = match[2] === '1';

    const validation = await this.paymentReceiptValidationsRepository.findOne({
      where: { id: validationId },
    });
    if (!validation) {
      await ctx.answerCbQuery('❌ Comprobante no encontrado.', {
        show_alert: true,
      });
      return;
    }
    if (validation.estado !== 'PENDIENTE_REVISION') {
      await ctx.answerCbQuery('Este comprobante ya fue resuelto.', {
        show_alert: true,
      });
      return;
    }

    await ctx.answerCbQuery();
    validation.revisadoPorUserId = jefeUser.id;
    validation.revisadoAt = new Date();

    try {
      await ctx.editMessageReplyMarkup(undefined);
    } catch {
      // El mensaje puede haber sido editado o eliminado; el flujo continua.
    }

    if (!approve) {
      validation.estado = 'RECHAZADO';
      await this.paymentReceiptValidationsRepository.save(validation);
      if (validation.chatId) {
        await ctx.telegram
          .sendMessage(
            validation.chatId,
            '⚠️ Tu comprobante fue rechazado tras revisión manual. Por favor envía un nuevo comprobante.',
          )
          .catch(() => undefined);
      }
      return;
    }

    const draft = validation.draftPayload as
      | {
          clientId: string;
          empleadaId: string;
          duracionPactadaHoras: number;
          metodoPago: 'efectivo' | 'tarjeta' | 'transferencia' | 'mixto';
          locationLat: string;
          locationLng: string;
          locationNotas: string | null;
          telegramId: string;
        }
      | undefined;

    if (!draft) {
      await ctx.reply('❌ No fue posible recuperar los datos de la reserva.');
      return;
    }

    validation.estado = 'APROBADO';
    await this.paymentReceiptValidationsRepository.save(validation);

    const [client, empleada] = await Promise.all([
      this.clientesRepository.findOne({ where: { id: draft.clientId } }),
      this.empleadasRepository.findOne({ where: { id: draft.empleadaId } }),
    ]);
    if (!client || !empleada) {
      await ctx.reply(
        '❌ No fue posible completar la reserva: datos faltantes.',
      );
      return;
    }

    await this.finalizeBooking(
      ctx,
      client,
      empleada,
      draft.duracionPactadaHoras,
      draft.metodoPago,
      draft.locationLat,
      draft.locationLng,
      draft.locationNotas,
      draft.telegramId,
      validation.id,
    );
  }

  @Action(/^extender_servicio:(.+):(.+)$/)
  async onExtenderServicio(@Ctx() ctx: Context) {
    const match = (ctx as any).match;
    if (!match) return;
    const servicioId = match[1];
    const horasAExtender = parseInt(match[2], 10);

    const servicio = await this.serviciosRepository.findOne({
      where: { id: servicioId },
      relations: { empleada: { usuario: true } },
    });

    if (!servicio) {
      await ctx.answerCbQuery('❌ Servicio no encontrado.');
      return;
    }

    if (servicio.estado !== 'en_curso') {
      await ctx.answerCbQuery('⚠️ El servicio ya no está activo.');
      return;
    }

    // Actualizar duracion pactada
    const nuevaDuracion = servicio.duracionPactadaHoras + horasAExtender;
    servicio.duracionPactadaHoras = nuevaDuracion;
    // Resetear flag para que pueda volver a notificar 15 minutos antes de la nueva hora
    servicio.notificacionExtensionEnviada = false;

    await this.serviciosRepository.save(servicio);
    await this.servicesService.recalculateScheduledSuccessor(servicio.id);
    this.realtimeEventsService.emitToJefes({
      type: 'employee_availability_updated',
      empleadaId: servicio.empleadaId,
      activeServiceId: servicio.id,
    });
    await ctx.answerCbQuery('✅ Servicio extendido con éxito.');

    // Volver a cargar para ver los totales actualizados por los triggers de Postgres
    const servicioActualizado = await this.serviciosRepository.findOne({
      where: { id: servicioId },
    });

    const total = servicioActualizado?.totalFinal || servicio.totalFinal;

    try {
      await ctx.editMessageText(
        `✅ *Servicio Extendido* ➕${horasAExtender}h\n\n` +
          `• Nueva Duración Pactada: *${nuevaDuracion} horas*\n` +
          `• Nuevo Total Estimado: *$${total}*\n\n` +
          `El cambio ha sido registrado automáticamente en el sistema.`,
        { parse_mode: 'Markdown' },
      );
    } catch (err) {
      console.error('Error al editar mensaje de extensión:', err);
    }
  }

  @Action(/^no_extender_servicio:(.+)$/)
  async onNoExtenderServicio(@Ctx() ctx: Context) {
    await ctx.answerCbQuery();
    try {
      await ctx.editMessageText(
        `👍 Entendido. El servicio finalizará en el tiempo pactado inicialmente.`,
        { parse_mode: 'Markdown' },
      );
    } catch (err) {
      console.error('Error al editar mensaje de no extensión:', err);
    }
  }

  @On('text')
  async onMessage(@Ctx() ctx: BotContext) {
    if (
      ctx.session?.step === 'AWAITING_EMPLOYEE_DRIVER_RATING_COMMENT' ||
      ctx.session?.step === 'AWAITING_EMPLOYEE_CONDUCT_DESCRIPTION'
    ) {
      const description = (
        (ctx.message as { text?: string })?.text || ''
      ).trim();
      if (description.length < 3 || description.length > 2000) {
        await ctx.reply('El texto debe tener entre 3 y 2000 caracteres.');
        return;
      }
      const user = await this.usuariosRepository.findOne({
        where: {
          telegramChatId: ctx.from!.id.toString(),
          rol: 'empleada',
        },
      });
      if (!user || !ctx.session.disciplineDirection) {
        await ctx.reply('No fue posible validar tu perfil de empleada.');
        return;
      }
      const interactionId =
        ctx.session.disciplineDirection === 'employee_to_driver'
          ? ctx.session.disciplineTripId
          : ctx.session.disciplineServiceId;
      if (!interactionId) {
        ctx.session = {};
        await ctx.reply('La sesión expiró. Inicia el proceso nuevamente.');
        return;
      }
      if (ctx.session.step === 'AWAITING_EMPLOYEE_DRIVER_RATING_COMMENT') {
        const direction = ctx.session.disciplineDirection;
        await this.disciplineService.createRating(
          { id: user.id, rol: 'empleada' },
          {
            direction,
            interactionId,
            stars: ctx.session.disciplineStars!,
            comment: description,
          },
        );
        ctx.session = {};
        await ctx.reply(
          'Calificación registrada. Puedes crear un reporte adicional si lo consideras necesario.',
          Markup.inlineKeyboard([
            [
              Markup.button.callback(
                'Crear también un reporte',
                `conduct_employee_${direction === 'employee_to_client' ? 'client' : 'driver'}:${interactionId}`,
              ),
            ],
          ]),
        );
      } else {
        await this.disciplineService.createReport(
          { id: user.id, rol: 'empleada' },
          {
            direction: ctx.session.disciplineDirection,
            interactionId,
            category: 'otro',
            description,
          },
        );
        ctx.session = {};
        await ctx.reply('Reporte enviado para revisión administrativa.');
      }
      return;
    }
    if ((ctx.session?.step as string) === 'AWAITING_DRIVER_REPORT_DESCRIPTION')
      return;
    if (ctx.session?.step === 'AWAITING_CLIENT_REPORT_DESCRIPTION') {
      const description = (
        (ctx.message as { text?: string })?.text || ''
      ).trim();
      if (description.length < 3 || description.length > 2000) {
        await ctx.reply('La descripción debe tener entre 3 y 2000 caracteres.');
        return;
      }
      ctx.session.reportDescription = description;
      await ctx.reply(
        `Confirma tu reporte:\n\nCategoría: ${this.reportCategoryLabel(ctx.session.reportCategory!)}\nDescripción: ${description}`,
        {
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('✅ Enviar', 'er_client_confirm'),
              Markup.button.callback('❌ Cancelar', 'er_client_cancel'),
            ],
          ]),
        },
      );
      return;
    }
    if (ctx.session?.step === 'AWAITING_MIXED_TRANSFER_AMOUNT') {
      const amount = parseReceiptAmount(
        (ctx.message as { text?: string })?.text,
      );
      const employee = ctx.session.empleadaId
        ? await this.empleadasRepository.findOne({
            where: { id: ctx.session.empleadaId },
          })
        : null;
      const totalBase =
        employee && ctx.session.duracionPactadaHoras
          ? Number(employee.precioBaseHora) * ctx.session.duracionPactadaHoras
          : 0;
      if (!amount || !totalBase || amount > totalBase) {
        await ctx.reply(
          'Escribe un monto de transferencia válido que no supere el costo base del servicio.',
        );
        return;
      }
      ctx.session.mixedTransferAmount = amount;
      ctx.session.step = 'AWAITING_PAYMENT_RECEIPT';
      await ctx.reply(
        `${await this.servicesService.bankTransferDetails()}\n\nEnvía una FOTO del comprobante por $${amount.toFixed(2)}. El resto y el transporte se pagarán en efectivo.`,
      );
      return;
    }
    if (ctx.session?.step === 'AWAITING_UBER_FARE') {
      const text = (ctx.message as { text?: string })?.text || '';
      const amount = parseUberFareInput(text);
      if (!amount) {
        await ctx.reply(
          '❌ Escribe una cantidad positiva con máximo dos decimales.',
        );
        return;
      }
      if (!ctx.session.uberTripId) {
        ctx.session = {};
        await ctx.reply(
          'La sesión de tarifa expiró. Pulsa nuevamente “Introducir tarifa”.',
        );
        return;
      }
      ctx.session.pendingUberFare = amount;
      await ctx.reply(`Confirma el costo del Uber: *$${amount.toFixed(2)}*`, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback(
              '✅ Confirmar',
              `uber_fare_confirm:${ctx.session.uberTripId}`,
            ),
          ],
          [
            Markup.button.callback(
              '✏️ Corregir',
              `uber_fare_correct:${ctx.session.uberTripId}`,
            ),
            Markup.button.callback(
              '❌ Cancelar',
              `uber_fare_cancel:${ctx.session.uberTripId}`,
            ),
          ],
        ]),
      });
      return;
    }

    // Los demás pasos administrativos tampoco deben caer en el puente
    // general entre el jefe y el cliente.
    if (isUberAdminInputSession(ctx.session)) return;

    const text = (ctx.message as { text?: string })?.text || '';
    const cleanText = text.trim().toLowerCase();
    const requestedPaymentMethod = extractHirePaymentMethod(cleanText);
    const asksToChangePayment =
      requestedPaymentMethod &&
      /\b(cambiar|cambio|prefiero|quiero|pagar|pago|mejor|siempre\s+s[ií])\b/i.test(
        cleanText,
      );

    if (
      requestedPaymentMethod &&
      ['AWAITING_PAYMENT_RECEIPT', 'AWAITING_MIXED_TRANSFER_AMOUNT'].includes(
        ctx.session?.step || '',
      )
    ) {
      if (requestedPaymentMethod === 'mixto') return;
      if (await this.applyDraftPaymentMethod(ctx, requestedPaymentMethod))
        return;
    }

    if (asksToChangePayment && ctx.chat?.type === 'private' && ctx.from?.id) {
      const client = await this.clientesRepository.findOne({
        where: { telegramChatId: ctx.from.id.toString() },
      });
      const service = client
        ? await this.serviciosRepository.findOne({
            where: {
              clienteId: client.id,
              estado: In(['pendiente', 'agendado', 'en_curso']),
            },
            order: { createdAt: 'DESC' },
          })
        : null;
      if (
        service &&
        requestedPaymentMethod &&
        requestedPaymentMethod !== 'mixto'
      ) {
        await this.servicesService.changePaymentMethodByClient(
          service.id,
          ctx.from.id.toString(),
          requestedPaymentMethod,
        );
        let response = `✅ Cambié el método de pago del servicio a *${requestedPaymentMethod.toUpperCase()}*.`;
        if (requestedPaymentMethod === 'transferencia') {
          response += `\n\n🏦 *Cuentas disponibles para transferencia*\n\n${await this.servicesService.bankTransferDetails()}`;
        }
        await ctx.reply(response, { parse_mode: 'Markdown' });
        return;
      }
    }

    const message = ctx.message as any;
    const threadId = message?.message_thread_id;
    const chatId = ctx.chat?.id?.toString();

    // Flujo 2: Respuestas del Jefe desde su Hilo hacia el Cliente (Webhook de Salida)
    if (
      threadId &&
      (ctx.chat?.type === 'supergroup' || ctx.chat?.type === 'group')
    ) {
      const cleanInput = text.trim();
      const isAccept = cleanInput === '🟢 Aceptar Servicio';
      const isReject = cleanInput === '🔴 Rechazar Servicio';

      if (isAccept || isReject) {
        try {
          const senderTelegramId = ctx.from?.id.toString();
          if (!senderTelegramId) return;

          const user = await this.usuariosRepository.findOne({
            where: { telegramChatId: senderTelegramId },
          });

          if (!user) {
            await ctx.reply(
              '❌ No tienes permisos o no estás registrado en el sistema.',
            );
            return;
          }

          const service = await this.serviciosRepository.findOne({
            where: {
              telegramThreadId: threadId.toString(),
              jefe: {
                grupoTelegramId: chatId,
              },
            },
            relations: { empleada: true, cliente: true },
          });

          if (!service) {
            await ctx.reply(
              '❌ No se encontró ningún servicio asociado a este hilo.',
            );
            return;
          }

          if (user.rol !== 'jefe' && user.rol !== 'admin') {
            await ctx.reply(
              '❌ No tienes permisos para autorizar este servicio.',
            );
            return;
          }

          if (isAccept) {
            await this.servicesService.aceptar(service.id, user.id);
            await ctx.reply(
              `🟢 *Servicio Aceptado* por ${user.email}`,
              Markup.removeKeyboard(),
            );
          } else {
            await this.servicesService.rechazar(service.id, user.id);
          }
        } catch (err: any) {
          this.logger.error(
            'Error al autorizar servicio por Reply Keyboard:',
            err,
          );
          await ctx.reply(
            `❌ Error: ${err.message || 'Error al procesar la solicitud.'}`,
          );
        }
        return;
      }

      try {
        const senderTelegramId = ctx.from?.id.toString();
        const actor = senderTelegramId
          ? await this.usuariosRepository.findOne({
              where: { telegramChatId: senderTelegramId },
            })
          : null;
        const groupRequest =
          actor && chatId
            ? await this.groupServicesService.findRequestByThread(
                threadId.toString(),
                chatId,
              )
            : null;
        if (
          groupRequest &&
          actor &&
          (actor.rol === 'admin' ||
            (actor.rol === 'jefe' && groupRequest.bossId === actor.id)) &&
          groupRequest.client?.telegramChatId
        ) {
          await ctx.telegram.sendMessage(
            groupRequest.client.telegramChatId,
            text,
          );
          await this.groupServicesService.recordRequestConversation(
            groupRequest,
            'jefe',
            text,
          );
          return;
        }
        const service = await this.serviciosRepository.findOne({
          where: {
            telegramThreadId: threadId.toString(),
            jefe: {
              grupoTelegramId: chatId,
            },
          },
        });

        if (
          service &&
          actor &&
          (actor.rol === 'admin' ||
            (actor.rol === 'jefe' && service.jefeId === actor.id)) &&
          service.clienteTelegramId
        ) {
          await ctx.telegram.sendMessage(service.clienteTelegramId, text);
          await this.recordConversation(service, 'jefe', text);
        }
      } catch (err) {
        this.logger.error('Error en Flujo 2 (Respuesta del Jefe):', err);
      }
      return;
    }

    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    // Flujo 1: Mensajes del Cliente hacia el Súpergrupo del Jefe Asignado (Webhook de Entrada)
    if (ctx.chat?.type === 'private') {
      try {
        const groupRequest =
          await this.groupServicesService.findActiveRequestByClientTelegram(
            telegramId,
          );
        if (
          groupRequest &&
          groupRequest.boss?.grupoTelegramId &&
          groupRequest.telegramThreadId &&
          ctx.session?.step === 'GROUP_WITH_BOSS'
        ) {
          await this.groupServicesService.recordRequestConversation(
            groupRequest,
            'cliente',
            text,
          );
          await ctx.telegram.sendMessage(
            groupRequest.boss.grupoTelegramId,
            text,
            {
              message_thread_id: Number(groupRequest.telegramThreadId),
            },
          );
          return;
        }
        const activeService = await this.serviciosRepository.findOne({
          where: {
            clienteTelegramId: telegramId,
            estado: In(['pendiente', 'en_curso']),
          },
          relations: {
            jefe: true,
            cliente: true,
            empleada: { jefe: true },
          },
          order: { createdAt: 'DESC' },
        });

        if (activeService && activeService.iaActiva === false) {
          const jefe = activeService.jefe || activeService.empleada?.jefe;
          const grupoTelegramId = jefe?.grupoTelegramId;
          this.logger.log(
            `Procesando mensaje de cliente. activeService.id=${activeService.id}, jefeId=${jefe?.id}, grupoTelegramId=${grupoTelegramId}`,
          );

          if (!grupoTelegramId) {
            this.logger.error(
              `El jefe para el servicio ${activeService.id} no tiene configurado grupoTelegramId.`,
            );
            return;
          }

          await this.recordConversation(activeService, 'cliente', text);

          if (!activeService.telegramThreadId) {
            const clientName =
              activeService.cliente?.nombreTelegram ||
              ctx.from?.first_name ||
              'Cliente';
            this.logger.log(
              `Creando tema de foro para cliente: ${clientName} en grupo: ${grupoTelegramId}`,
            );
            const topic = await ctx.telegram.createForumTopic(
              grupoTelegramId,
              `👤 Cliente: ${clientName}`,
            );
            this.logger.log(
              `Tema de foro creado con id: ${topic.message_thread_id}`,
            );
            activeService.telegramThreadId = topic.message_thread_id.toString();
            await this.serviciosRepository.save(activeService);

            const detailsMsg =
              `📋 *Información del Servicio:*\n\n` +
              `• *Cliente:* ${clientName} (ID: ${telegramId})\n` +
              `• *Empleada:* ${activeService.empleada?.nombreArtistico || 'N/A'}\n` +
              `• *Duración:* ${activeService.duracionPactadaHoras} horas\n` +
              `• *Método de Pago:* ${activeService.metodoPago.toUpperCase()}\n` +
              `• *Tarifa:* $${activeService.precioBaseHoraPactado}/hr\n` +
              (activeService.notas
                ? `• *Ubicación/Notas:* ${activeService.notas}\n`
                : '') +
              `• *Estado:* ${activeService.estado}`;
            const isPendiente = activeService.estado === 'pendiente';
            const extraOptions: any = {
              message_thread_id: topic.message_thread_id,
              parse_mode: 'Markdown',
            };
            if (isPendiente) {
              Object.assign(
                extraOptions,
                Markup.keyboard([
                  ['🟢 Aceptar Servicio', '🔴 Rechazar Servicio'],
                ])
                  .resize()
                  .oneTime(),
              );
            }
            await ctx.telegram.sendMessage(
              grupoTelegramId,
              detailsMsg,
              extraOptions,
            );
          }

          try {
            await ctx.telegram.sendMessage(grupoTelegramId, text, {
              message_thread_id: parseInt(activeService.telegramThreadId),
            });
          } catch (sendErr: any) {
            if (
              sendErr?.response?.description?.includes(
                'message thread not found',
              ) ||
              sendErr?.message?.includes('message thread not found')
            ) {
              this.logger.warn(
                `El tema de foro ${activeService.telegramThreadId} no fue encontrado en el grupo. Recreándolo...`,
              );
              const clientName =
                activeService.cliente?.nombreTelegram ||
                ctx.from?.first_name ||
                'Cliente';
              const topic = await ctx.telegram.createForumTopic(
                grupoTelegramId,
                `👤 Cliente: ${clientName}`,
              );
              activeService.telegramThreadId =
                topic.message_thread_id.toString();
              await this.serviciosRepository.save(activeService);

              const detailsMsg =
                `📋 *Información del Servicio (Tema Recreado):*\n\n` +
                `• *Cliente:* ${clientName} (ID: ${telegramId})\n` +
                `• *Empleada:* ${activeService.empleada?.nombreArtistico || 'N/A'}\n` +
                `• *Duración:* ${activeService.duracionPactadaHoras} horas\n` +
                `• *Método de Pago:* ${activeService.metodoPago.toUpperCase()}\n` +
                `• *Tarifa:* $${activeService.precioBaseHoraPactado}/hr\n` +
                (activeService.notas
                  ? `• *Ubicación/Notas:* ${activeService.notas}\n`
                  : '') +
                `• *Estado:* ${activeService.estado}`;

              const isPendiente = activeService.estado === 'pendiente';
              const extraOptions: any = {
                message_thread_id: topic.message_thread_id,
                parse_mode: 'Markdown',
              };
              if (isPendiente) {
                Object.assign(
                  extraOptions,
                  Markup.keyboard([
                    ['🟢 Aceptar Servicio', '🔴 Rechazar Servicio'],
                  ])
                    .resize()
                    .oneTime(),
                );
              }
              await ctx.telegram.sendMessage(
                grupoTelegramId,
                detailsMsg,
                extraOptions,
              );

              // Intentar enviar el mensaje original del cliente nuevamente en el nuevo hilo
              await ctx.telegram.sendMessage(grupoTelegramId, text, {
                message_thread_id: topic.message_thread_id,
              });
            } else {
              throw sendErr;
            }
          }
          return;
        }
      } catch (err) {
        this.logger.error('Error en Flujo 1 (Cliente -> Súpergrupo):', err);
      }
    }

    if (
      cleanText.includes('volver al menu') ||
      cleanText.includes('volver al menú') ||
      cleanText.includes('ver empleadas') ||
      cleanText.includes('ver ayuda') ||
      cleanText.includes('ayuda')
    ) {
      ctx.session = {};
      await ctx.reply(
        'Para contratar a una de nuestras empleadas, por favor utiliza el enlace de contratación directa en nuestra web.',
      );
      return;
    }

    const session = ctx.session;
    if (!session) return;
    const step = session.step;

    if (step === 'CHAT_CON_EMPLEADA' || step === 'AWAITING_LOCATION') {
      const empleadaId = session.empleadaId;
      if (!empleadaId) {
        await ctx.reply(
          '❌ Sesión inválida. Por favor, selecciona una empleada nuevamente.',
        );
        ctx.session = {};
        return;
      }

      const empleada = await this.empleadasRepository.findOne({
        where: { id: empleadaId },
      });

      if (!empleada) {
        await ctx.reply('La empleada seleccionada ya no existe en el sistema.');
        ctx.session = {};
        return;
      }

      const userMessage = (ctx.message as { text?: string })?.text || '';
      if (!userMessage.trim()) return;

      // Debounce / Buffer de mensajes seguidos del cliente para evitar que la IA responda por partes
      const existingBuffer = this.clientMessageBuffers.get(telegramId);
      if (existingBuffer) {
        clearTimeout(existingBuffer.timer);
        existingBuffer.messages.push(userMessage);
        existingBuffer.ctx = ctx;
        existingBuffer.timer = setTimeout(() => {
          this.flushClientMessageBuffer(telegramId, empleada);
        }, 4000);
        return;
      } else {
        const timer = setTimeout(() => {
          this.flushClientMessageBuffer(telegramId, empleada);
        }, 4000);
        this.clientMessageBuffers.set(telegramId, {
          messages: [userMessage],
          timer,
          ctx,
        });
        return;
      }
    }

    if (step === 'AWAITING_DURATION') {
      const text = (ctx.message as { text?: string })?.text || '';
      const duracion = parseInt(text.trim(), 10);

      if (
        isNaN(duracion) ||
        duracion < 1 ||
        duracion > 24 ||
        /\d+[.,]\d+/.test(text)
      ) {
        await ctx.reply(
          'La duración debe ser un número entero válido de horas (ejemplo: 1, 2, 3 entre 1 y 24).\n' +
            'Por favor, intenta nuevamente:',
        );
        return;
      }

      ctx.session!.duracionPactadaHoras = duracion;
      ctx.session!.step = 'AWAITING_PAYMENT_METHOD';

      await ctx.reply(
        `Duración registrada: *${duracion} horas*.\n\n` +
          `Ahora, selecciona el método de pago:`,
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [
              Markup.button.callback('Efectivo', 'pago_efectivo'),
              Markup.button.callback('Tarjeta', 'pago_tarjeta'),
            ],
            [Markup.button.callback('Transferencia', 'pago_transferencia')],
          ]),
        },
      );
      return;
    }

    if (step === 'AWAITING_RATING_COMMENT') {
      const text = (ctx.message as { text?: string })?.text || '';
      const comments = text.trim();

      if (!comments) {
        await ctx.reply(
          '❌ El comentario es obligatorio para calificaciones de 2 estrellas o menos.\n' +
            'Por favor, indícanos qué podemos mejorar:',
        );
        return;
      }

      const sentimentPrompt = getSentimentPrompt(comments);

      let analysisResult = { sentimiento: 'neutral', enojo: false, score: 2 };
      try {
        const responseText = await this.getGroqResponse(sentimentPrompt, []);
        const jsonMatch = responseText.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          analysisResult = JSON.parse(jsonMatch[0]);
        }
      } catch (err) {
        console.error('Error al analizar sentimiento con IA:', err);
      }

      const servicioId = ctx.session?.servicioIdCalificacion;
      if (servicioId) {
        const servicio = await this.serviciosRepository.findOne({
          where: { id: servicioId },
          relations: {
            cliente: true,
            empleada: { usuario: true, jefe: true },
            jefe: true,
          },
        });
        if (servicio) {
          const client = await this.clientesRepository.findOne({
            where: { telegramChatId: ctx.from!.id.toString() },
          });
          if (!client) {
            await ctx.reply('No fue posible identificar al cliente.');
            return;
          }
          const rating = ctx.session?.pendingRating ?? analysisResult.score;
          await this.disciplineService.createClientRating(client.id, {
            direction: 'client_to_employee',
            interactionId: servicio.id,
            employeeId: ctx.session?.groupRatingEmployeeId,
            stars: rating,
            comment: comments,
          });
          servicio.comentariosCalificacion = comments;
          servicio.calificacion = rating;
          if (ctx.session) ctx.session.groupRatingEmployeeId = undefined;

          await this.serviciosRepository.save(servicio);

          // Si se detecta enojo o frustración grave, alertar al Jefe/Admin de inmediato
          if (analysisResult.enojo) {
            const jefeGrupoId =
              servicio.jefe?.grupoTelegramId ||
              servicio.empleada?.jefe?.grupoTelegramId;
            const jefeChatId =
              servicio.jefe?.telegramChatId ||
              servicio.empleada?.jefe?.telegramChatId;

            const alertMsg =
              `⚠️ *ALERTA DE CLIENTE MOLESTO* ⚠️\n\n` +
              `Un cliente ha dejado una reseña expresando molestia o enojo grave:\n\n` +
              `• *Cliente:* ${servicio.cliente?.nombreTelegram || 'Desconocido'}\n` +
              `• *Empleada:* ${servicio.empleada?.nombreArtistico || 'N/A'}\n` +
              `• *Calificación:* ${servicio.calificacion} ⭐\n` +
              `• *Comentario:* "${comments}"\n\n` +
              `• *Análisis de IA:* Sentimiento: *${analysisResult.sentimiento.toUpperCase()}* (Enojo Detectado)\n\n` +
              `Por favor, contacta al cliente de inmediato para resolver la situación.`;

            if (jefeGrupoId) {
              try {
                await ctx.telegram.sendMessage(jefeGrupoId, alertMsg, {
                  parse_mode: 'Markdown',
                });
              } catch (e) {
                console.error('Error al enviar alerta a grupo de Jefe:', e);
              }
            } else if (jefeChatId) {
              try {
                await ctx.telegram.sendMessage(jefeChatId, alertMsg, {
                  parse_mode: 'Markdown',
                });
              } catch (e) {
                console.error('Error al enviar alerta privada a Jefe:', e);
              }
            }
          }
        }
      }

      ctx.session = {};

      await ctx.reply(
        `Muchas gracias por tus comentarios. Valoramos mucho tu opinión para seguir mejorando.`,
        servicioId
          ? Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  '⚠️ Reportar empleada',
                  `er_client_start:${servicioId}`,
                ),
              ],
            ])
          : Markup.removeKeyboard(),
      );
      return;
    }

    const user = await this.usuariosRepository.findOne({
      where: { telegramChatId: telegramId },
    });

    if (user) {
      await ctx.reply(
        `Hola ${user.email} (${user.rol.toUpperCase()}). He recibido tu mensaje. ` +
          `Como personal del sistema, tus consultas se procesarán de inmediato.`,
      );
      return;
    }

    let client = await this.clientesRepository.findOne({
      where: { telegramChatId: telegramId },
    });

    if (!client) {
      const firstName = ctx.from?.first_name || '';
      const username = ctx.from?.username || '';
      const fullName =
        [firstName, ctx.from?.last_name].filter(Boolean).join(' ') ||
        username ||
        'Cliente';

      client = this.clientesRepository.create({
        telegramChatId: telegramId,
        nombreTelegram: fullName,
      });
      await this.clientesRepository.save(client);
    }

    await ctx.reply(
      `Hola ${client.nombreTelegram || 'Cliente'}. ` +
        `He recibido tu mensaje. Un administrador se pondrá en contacto contigo pronto.`,
    );
  }

  @Action(/^pedir_prorroga:(.+)$/)
  async onPedirProrroga(@Ctx() ctx: Context) {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return;

    const match = (ctx as any).match;
    const servicioId = match[1];

    const servicio = await this.serviciosRepository.findOne({
      where: { id: servicioId },
      relations: {
        empleada: { usuario: true },
        viajes: { chofer: { usuario: true } },
      },
    });

    if (!servicio) {
      await ctx.answerCbQuery('❌ Servicio no encontrado.', {
        show_alert: true,
      });
      return;
    }

    if (!(await this.isAssignedEmployee(ctx, servicio))) {
      await ctx.answerCbQuery(
        'No puedes solicitar prórrogas para este servicio.',
        { show_alert: true },
      );
      return;
    }

    if (!['pendiente', 'agendado', 'en_curso'].includes(servicio.estado)) {
      await ctx.answerCbQuery(
        '⚠️ Este servicio ya no está activo o fue cancelado.',
        { show_alert: true },
      );
      return;
    }

    if (servicio.prorrogasUsadas >= 3) {
      await ctx.answerCbQuery(
        '❌ Ya has utilizado el máximo de 3 prórrogas permitidas.',
        { show_alert: true },
      );
      return;
    }

    const extension = await this.extensionsService.requestServiceExtension(
      servicio.id,
      10,
    );
    servicio.prorrogasUsadas = extension.extensionNumber;
    await ctx.answerCbQuery('Prórroga de 10 minutos concedida.');

    // Reiniciar wait timeout a 10 minutos (600,000 ms)
    this.servicesService.startWaitTimeout(servicio.id, 600000);

    // Notificar al chofer
    const viajeIda = servicio.viajes.find((v) => v.tipo === 'ida');
    if (viajeIda && viajeIda.chofer?.usuario?.telegramChatId) {
      try {
        await ctx.telegram.sendMessage(
          viajeIda.chofer.usuario.telegramChatId,
          `⏳ *Aviso de Demora:* La empleada *${servicio.empleada.nombreArtistico}* ha solicitado una prórroga de 10 minutos (Prórroga ${servicio.prorrogasUsadas} de 3). El tiempo de espera se ha extendido.`,
          { parse_mode: 'Markdown' },
        );
      } catch (err) {
        console.error('Error al notificar al chofer sobre la prórroga:', err);
      }
    }

    // Actualizar mensaje de la empleada
    let originalText = (ctx.callbackQuery?.message as any)?.text || '';
    // Limpiar alertas de prórroga previas
    originalText = originalText.replace(/\n\n⚠️ \*Has solicitado.*?\*/g, '');

    const newText =
      originalText +
      `\n\n⚠️ *Has solicitado una prórroga. Has usado ${servicio.prorrogasUsadas} de 3 prórrogas.*`;

    // Si aún tiene prórrogas disponibles, mantener el botón. De lo contrario, quitarlo.
    const inlineButtons: any[][] = [];
    if (servicio.prorrogasUsadas < 3) {
      inlineButtons.push([
        Markup.button.callback(
          '⏳ Solicitar Prórroga (10 min)',
          `pedir_prorroga:${servicio.id}`,
        ),
      ]);
    }

    try {
      await ctx.editMessageText(newText, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(inlineButtons),
      });
    } catch (err) {
      console.error('Error al editar mensaje de empleada tras prórroga:', err);
    }
  }

  private async handoffGroupRequest(
    ctx: BotContext,
    initialEmployeeId?: string,
  ): Promise<void> {
    const telegramId = ctx.from?.id?.toString();
    if (!telegramId) return;
    const client = await this.clientesRepository.findOne({
      where: { telegramChatId: telegramId },
    });
    if (!client) {
      await ctx.reply(
        'No pude identificar tu registro de cliente. Vuelve a abrir el enlace de contratación.',
      );
      return;
    }
    const message =
      '¡Uy qué rico! Déjame ver qué amiguitas mías están disponibles para que armemos algo bien delicioso y te aviso en un momentito.';
    await ctx.reply(message, Markup.removeKeyboard());

    let request;
    try {
      request = await this.groupServicesService.createFromDetectedIntent(
        client.id,
        initialEmployeeId,
        ctx.session?.bookingSessionId,
      );
    } catch (err: any) {
      this.logger.error('Error creando solicitud grupal:', err);
      if (err instanceof ConflictException) {
        await ctx.reply(
          'Uy amor, me acaban de avisar que ahorita todas mis amigas andan ocupadas. Si quieres nos vemos tú y yo solitos, ¿cuántas horitas te gustaría?',
        );
      } else {
        await ctx.reply(
          'Uy lindo, déjame checarlo bien y te confirmo en un momentito.',
        );
      }
      return;
    }
    ctx.session = {
      ...(ctx.session ?? {}),
      step: 'GROUP_WITH_BOSS',
      groupRequestId: request.id,
      groupIntentClarificationPending: false,
    };

    try {
      const bossGroupId = request.boss?.grupoTelegramId;
      if (bossGroupId && !request.telegramThreadId) {
        const clientName =
          client.nombreTelegram || ctx.from?.first_name || 'Cliente';
        const topic = await ctx.telegram.createForumTopic(
          bossGroupId,
          `Grupo: ${clientName}`,
        );
        await this.groupServicesService.setTelegramThread(
          request.id,
          topic.message_thread_id.toString(),
        );
        await ctx.telegram.sendMessage(
          bossGroupId,
          `Solicitud de servicio grupal\nCliente: ${clientName}\nLa IA fue desactivada. Organiza participantes, ubicación, horas, pago y transporte desde el panel del jefe.`,
          { message_thread_id: topic.message_thread_id },
        );
        const history = await this.conversationsRepository.find({
          where: { groupRequestId: request.id },
          order: { enviadoAt: 'ASC' },
        });
        for (const item of history) {
          const label =
            item.emisor === 'cliente'
              ? 'Cliente'
              : item.emisor === 'ia'
                ? 'IA'
                : 'Sistema';
          await ctx.telegram.sendMessage(
            bossGroupId,
            `${label}: ${item.mensaje}`,
            { message_thread_id: topic.message_thread_id },
          );
        }
      }
    } catch (topicErr) {
      this.logger.error(
        'Error creando tema de foro para solicitud grupal:',
        topicErr,
      );
    }
    await this.groupServicesService.recordRequestConversation(
      request,
      'sistema',
      message,
    );
  }

  private async isAssignedEmployee(
    ctx: Context,
    service: Servicios,
  ): Promise<boolean> {
    const telegramId = ctx.from?.id.toString();
    if (!telegramId) return false;

    if (service.serviceType === 'grupal') {
      return Boolean(
        await this.groupServicesService.participantAccess(
          service.id,
          telegramId,
        ),
      );
    }

    const employee = await this.empleadasRepository.findOne({
      where: {
        id: service.empleadaId,
        usuario: { telegramChatId: telegramId, rol: 'empleada' },
      },
      relations: { usuario: true },
    });

    return Boolean(employee);
  }

  private async recordConversation(
    service: Servicios,
    sender: 'ia' | 'jefe' | 'cliente' | 'sistema',
    message: string,
  ): Promise<void> {
    const saved = await this.conversationsRepository.save(
      this.conversationsRepository.create({
        clienteId: service.clienteId,
        servicioId: service.id,
        emisor: sender,
        mensaje: message,
        iaActiva: service.iaActiva,
      }),
    );
    this.realtimeEventsService.emitToBoss(service.jefeId, {
      type: 'chat_message',
      data: saved,
    });
  }

  private async recordDraftConversation(
    ctx: BotContext,
    sender: 'ia' | 'cliente' | 'sistema',
    message: string,
  ): Promise<void> {
    const telegramId = ctx.from?.id?.toString();
    const bookingSessionId = ctx.session?.bookingSessionId;
    if (!telegramId || !bookingSessionId || !message.trim()) return;
    const client = await this.clientesRepository.findOne({
      where: { telegramChatId: telegramId },
    });
    if (!client) return;
    await this.conversationsRepository.save(
      this.conversationsRepository.create({
        clienteId: client.id,
        servicioId: null,
        bookingSessionId,
        emisor: sender,
        mensaje: message,
        iaActiva: true,
      }),
    );
  }

  private async attachAndReplayDraftConversation(
    ctx: BotContext,
    service: Servicios,
    groupId: string,
    threadId: number,
  ): Promise<void> {
    const bookingSessionId = ctx.session?.bookingSessionId;
    if (!bookingSessionId) return;
    const messages = await this.conversationsRepository.find({
      where: { bookingSessionId },
      order: { enviadoAt: 'ASC' },
    });
    if (!messages.length) return;
    await this.conversationsRepository.update(
      { bookingSessionId },
      { servicioId: service.id, iaActiva: false },
    );

    // Agrupamos el historial en bloques para evitar exceder el límite de caracteres (4096) y evitar el error 429 de Telegram
    let currentChunk = '📝 *Historial previo de la conversación:*\n\n';
    for (const item of messages) {
      const label =
        item.emisor === 'cliente'
          ? '👤 *Cliente*'
          : item.emisor === 'ia'
            ? '🤖 *IA*'
            : '⚙️ *Sistema*';
      const line = `${label}: ${item.mensaje}\n`;

      if (currentChunk.length + line.length > 3800) {
        try {
          await ctx.telegram.sendMessage(groupId, currentChunk, {
            message_thread_id: threadId,
            parse_mode: 'Markdown',
          });
        } catch {
          await ctx.telegram.sendMessage(groupId, currentChunk, {
            message_thread_id: threadId,
          });
        }
        currentChunk = '';
      }
      currentChunk += line;
    }

    if (currentChunk.trim().length > 0) {
      try {
        await ctx.telegram.sendMessage(groupId, currentChunk, {
          message_thread_id: threadId,
          parse_mode: 'Markdown',
        });
      } catch {
        await ctx.telegram.sendMessage(groupId, currentChunk, {
          message_thread_id: threadId,
        });
      }
    }
  }

  private async flushClientMessageBuffer(
    telegramId: string,
    empleada: Empleadas,
  ): Promise<void> {
    const buffer = this.clientMessageBuffers.get(telegramId);
    if (!buffer) return;
    this.clientMessageBuffers.delete(telegramId);

    const ctx = buffer.ctx;
    const session = ctx.session;
    if (!session) return;

    const userMessage = buffer.messages.join('\n').trim();
    if (!userMessage) return;

    await this.recordDraftConversation(ctx, 'cliente', userMessage);

    const normalizedAnswer = userMessage.toLowerCase();
    if (session.groupIntentClarificationPending) {
      if (
        /^(s[ií]|claro|correcto|exacto|varias|más de una)\b/.test(
          normalizedAnswer,
        )
      ) {
        await this.handoffGroupRequest(ctx, empleada.id);
        return;
      }
      if (/^(no|solo una|solamente una)\b/.test(normalizedAnswer)) {
        session.groupIntentClarificationPending = false;
      } else {
        await ctx.reply(
          'Solo para confirmar: ¿quieres contratar a dos o más empleadas?',
        );
        return;
      }
    } else {
      const groupIntent = detectGroupServiceIntent(userMessage);
      if (groupIntent === 'grupal') {
        await this.handoffGroupRequest(ctx, empleada.id);
        return;
      }
      if (groupIntent === 'incierta') {
        session.groupIntentClarificationPending = true;
        await ctx.reply(
          '¿Quieres que el servicio incluya a dos o más empleadas?',
        );
        return;
      }
    }

    if (session.waitingForBusyChoice) {
      const normalized = userMessage.toLowerCase();
      if (
        /\b(otra|otras|opciones|disponibles|cat[aá]logo|ver)\b/.test(normalized)
      ) {
        await this.showAvailableEmployeeCatalog(ctx);
        return;
      }
      if (
        /\b(esperar|espero|quiero a|con ella|reservar|agendar)\b/.test(
          normalized,
        ) ||
        extractHireDuration(userMessage) ||
        extractHirePaymentMethod(userMessage)
      ) {
        session.waitingForBusyChoice = false;
      } else {
        const clarification =
          '¿Prefieres esperar a esta empleada o ver las empleadas disponibles ahora?';
        await this.sendDelayedReply(ctx, clarification);
        await this.recordDraftConversation(ctx, 'ia', clarification);
        return;
      }
    }

    // Actualizar duración o método de pago si el cliente lo mencionó o cambió
    const extractedDuration = extractHireDuration(userMessage);
    const extractedPayment = extractHirePaymentMethod(userMessage);

    if (extractedDuration) {
      session.duracionPactadaHoras = extractedDuration;
    }
    if (extractedPayment) {
      session.metodoPago = extractedPayment;
    }

    const history = session.chatHistory || [];
    history.push({ role: 'user', parts: [{ text: userMessage }] });

    const [empleadaExtras, presetLocations] = await Promise.all([
      this.extrasCatalogoRepository.find({
        where: { empleadaId: empleada.id, activo: true },
      }),
      this.transportOperations.activeLocations(),
    ]);

    const extrasData = empleadaExtras.map((e) => ({
      nombre: e.nombre,
      precio: Number(e.precio),
    }));
    const ubicacionesData = presetLocations.map(
      (l) => `${l.name}${l.address ? ` (${l.address})` : ''}`,
    );

    const generalPrompt = getGeneralChatSystemPrompt({
      nombreArtistico: empleada.nombreArtistico,
      precioBaseHora: empleada.precioBaseHora,
      descripcion: empleada.descripcion,
      extras: extrasData,
      ubicacionesPreestablecidas: ubicacionesData,
      duracionPactada: session.duracionPactadaHoras,
      metodoPago: session.metodoPago,
    });
    const systemPrompt = session.selectedEmployeeBusy
      ? `Eres el asistente de la agencia, no eres la empleada y nunca debes hablar como si lo fueras. ${generalPrompt}`
      : generalPrompt;

    try {
      await ctx.sendChatAction('typing');
      const responseText = await this.getGroqResponse(
        systemPrompt,
        history,
        telegramId,
      );

      if (responseText.includes('[GROUP_INTENT]')) {
        await this.handoffGroupRequest(ctx, empleada.id);
        return;
      }
      if (responseText.includes('[GROUP_UNCLEAR]')) {
        session.groupIntentClarificationPending = true;
        await ctx.reply(
          '¿Quieres que el servicio incluya a dos o más empleadas?',
        );
        return;
      }

      // Check if response contains [SEND_EXCLUSIVE_PHOTO]
      const hasPhotoIntent = responseText.includes('[SEND_EXCLUSIVE_PHOTO]');
      const cleanText = responseText
        .replace(/\[SEND_EXCLUSIVE_PHOTO\]/g, '')
        .replace(/\[DATA:\s*\{.*?\}\]/g, '')
        .trim();

      if (hasPhotoIntent) {
        try {
          const empleadaModel = await this.empleadasRepository.findOne({
            where: { id: empleada.id },
            relations: { fotosExclusivas: true, empleadaFotos: true },
          });
          const photosToSend =
            empleadaModel?.fotosExclusivas &&
            empleadaModel.fotosExclusivas.length > 0
              ? empleadaModel.fotosExclusivas
              : empleadaModel?.empleadaFotos || [];

          if (photosToSend.length > 0) {
            const randomPhoto =
              photosToSend[Math.floor(Math.random() * photosToSend.length)];
            await ctx.telegram.sendPhoto(telegramId, randomPhoto.url, {
              caption: cleanText || `Para ti con cariño... 🔥`,
            });
            history.push({
              role: 'model',
              parts: [{ text: cleanText || 'Te envié una foto.' }],
            });
            session.chatHistory = history;
            await this.recordDraftConversation(
              ctx,
              'ia',
              `[Foto exclusiva enviada] ${cleanText}`,
            );
            return;
          }
        } catch (photoErr) {
          this.logger.warn(
            'Error enviando foto exclusiva por telegram:',
            photoErr,
          );
        }
      }

      // Check if response contains the structured DATA block
      const dataMatch = responseText.match(/\[DATA:\s*(\{.*?\})\]/);

      if (dataMatch) {
        try {
          const parsedData = JSON.parse(dataMatch[1]);
          const parsedDuracion = parseInt(parsedData.duracion, 10);
          const userProvidedPayment =
            extractHirePaymentMethod(userMessage) ||
            history
              .filter((h) => h.role === 'user')
              .map((h) => extractHirePaymentMethod(h.parts[0]?.text || ''))
              .find((method) => Boolean(method));

          if (
            Number.isInteger(parsedDuracion) &&
            parsedDuracion >= 1 &&
            parsedDuracion <= 24
          ) {
            session.duracionPactadaHoras = parsedDuracion;
            if (userProvidedPayment) {
              session.metodoPago = userProvidedPayment;
            } else if (
              parsedData.pago &&
              extractHirePaymentMethod(userMessage)
            ) {
              session.metodoPago = parsedData.pago;
            }

            if (session.duracionPactadaHoras && session.metodoPago) {
              session.step = 'AWAITING_LOCATION';
              history.push({ role: 'model', parts: [{ text: cleanText }] });
              session.chatHistory = history;

              const presetName = parsedData.ubicacionPreestablecida;
              let matchedLocation: any = null;
              if (presetName && typeof presetName === 'string') {
                const activeLocs =
                  await this.transportOperations.activeLocations();
                matchedLocation =
                  activeLocs.find(
                    (loc) =>
                      loc.name
                        .toLowerCase()
                        .includes(presetName.toLowerCase().trim()) ||
                      presetName
                        .toLowerCase()
                        .includes(loc.name.toLowerCase().trim()),
                  ) || null;
              }

              if (matchedLocation) {
                await this.sendDelayedReply(ctx, cleanText);
                await this.recordDraftConversation(ctx, 'ia', cleanText);

                session.presetLocationId = matchedLocation.id;
                session.locationNameSnapshot = matchedLocation.name;
                session.locationAddressSnapshot = matchedLocation.address;
                session.customerTransportCharge = 0;

                await this.onLocation(ctx, {
                  latitude: Number(matchedLocation.latitude),
                  longitude: Number(matchedLocation.longitude),
                  title: matchedLocation.name,
                  address: matchedLocation.address,
                });
                return;
              }

              await this.replyWithServiceLocationOptions(
                ctx,
                cleanText || 'Selecciona la ubicación del servicio.',
              );
              await this.recordDraftConversation(
                ctx,
                'ia',
                cleanText || 'Selecciona la ubicación del servicio.',
              );
              return;
            }
          }
        } catch (jsonErr) {
          this.logger.error(
            'Failed to parse LLM extracted JSON data:',
            jsonErr,
          );
        }
      }

      history.push({ role: 'model', parts: [{ text: cleanText }] });
      session.chatHistory = history;

      // Si ya teníamos horas y pago y el cliente sólo está chateando o en paso de ubicación, volver a ofrecer la selección de ubicación
      if (session.step === 'AWAITING_LOCATION') {
        await this.replyWithServiceLocationOptions(
          ctx,
          cleanText || 'Selecciona la ubicación del servicio.',
        );
        await this.recordDraftConversation(
          ctx,
          'ia',
          cleanText || 'Selecciona la ubicación del servicio.',
        );
        return;
      }

      await this.sendDelayedReply(ctx, cleanText);
      await this.recordDraftConversation(ctx, 'ia', cleanText);
    } catch (err: any) {
      if (err?.message === 'AI_LIMIT_REACHED') {
        await ctx.reply(
          '⚠️ *Límite de IA alcanzado:* Has agotado tus consultas gratuitas de hoy con la Inteligencia Artificial. Por favor, intenta de nuevo mañana.',
          { parse_mode: 'Markdown' },
        );
        return;
      }
      this.logger.error('Error in LLM booking chat flow:', err);
      await this.sendDelayedReply(
        ctx,
        'Oye lindo, se me cortó un segundo la señal 🙈 ¿Me recuerdas cuántas horitas querías y cómo vas a pagar (efectivo, tarjeta o transferencia)?',
      );
    }
  }
}
