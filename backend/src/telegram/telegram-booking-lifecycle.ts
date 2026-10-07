/**
 * Reglas puras del ciclo de vida de una solicitud de cliente.
 *
 * La conversación de Telegram es permanente; una booking session representa
 * únicamente un intento de crear un servicio. Este módulo no conoce Telegraf,
 * TypeORM ni la IA: decide intención y transiciones para que los manejadores
 * no puedan saltarse el dominio por accidente.
 */

export const BOOKING_STATUSES = [
  'IDLE',
  'COLLECTING',
  'READY',
  'SERVICE_CREATED',
  'CANCELLED',
  'ABANDONED',
  'STALE_PENDING',
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const GLOBAL_BOOKING_INTENTS = [
  'START_NEW_BOOKING',
  'CHANGE_EMPLOYEE',
  'RESTART_BOOKING',
  'CANCEL_BOOKING',
  'REQUEST_HUMAN',
  'ASK_STATUS',
  'CONTINUE_BOOKING',
  'GENERAL_QUESTION',
  'PROVIDE_EXPECTED_DATA',
  'UNKNOWN',
] as const;

export type GlobalBookingIntent = (typeof GLOBAL_BOOKING_INTENTS)[number];

export interface BookingIntentResult {
  intent: GlobalBookingIntent;
  employeeName?: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface BookingRequirements {
  employeeId?: string | null;
  durationHours?: number | null;
  openEnded?: boolean;
  locationConfirmed?: boolean;
  paymentMethod?: string | null;
  confirmationReceived?: boolean;
}

export interface LoopBreakerState {
  lastStep?: string;
  lastIntent?: GlobalBookingIntent;
  failureCount: number;
}

export const DEFAULT_LOOP_BREAKER_MAX_FAILURES = 3;

export const TERMINAL_BOOKING_STATUSES: readonly BookingStatus[] = [
  'SERVICE_CREATED',
  'CANCELLED',
  'ABANDONED',
];

export function normalizeBookingText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(text: string, expressions: readonly RegExp[]): boolean {
  return expressions.some((expression) => expression.test(text));
}

function employeeMention(
  text: string,
  employeeNames: readonly string[],
): string | undefined {
  const normalized = normalizeBookingText(text);
  return employeeNames.find((name) => {
    const candidate = normalizeBookingText(name);
    return candidate.length > 1 && normalized.includes(candidate);
  });
}

/**
 * Router determinista. Se ejecuta antes del currentStep y antes de consultar
 * al modelo. La IA puede aportar datos ambiguos, pero nunca gana a una orden
 * explícita del cliente.
 */
export function detectGlobalBookingIntent(
  text: string,
  options: { employeeNames?: readonly string[] } = {},
): BookingIntentResult {
  const normalized = normalizeBookingText(text);
  const mentionedEmployee = employeeMention(
    normalized,
    options.employeeNames ?? [],
  );

  if (!normalized) return { intent: 'UNKNOWN', confidence: 'low' };

  if (
    hasAny(normalized, [
      /\b(hablar|comunicarme|pasarme|contactarme)\s+(con\s+)?(una\s+)?persona\b/,
      /\b(atencion|atenci[oó]n)\s+humana\b/,
      /\b(asesor|asesora|jefe|humano)\b/,
    ])
  ) {
    return { intent: 'REQUEST_HUMAN', confidence: 'high' };
  }

  if (
    hasAny(normalized, [
      /^cancelar(\s+(la\s+)?(solicitud|reserva|booking))?$/,
      /\b(cancelar|cancela|ya no quiero|olvidalo|olvida eso)\b/,
    ])
  ) {
    return { intent: 'CANCEL_BOOKING', confidence: 'high' };
  }

  if (
    hasAny(normalized, [
      /\b(empezar|comenzar|volver)\s+(de\s+)?(nuevo|cero)\b/,
      /\breinicia(r|lo)?\b/,
      /\bdesde\s+cero\b/,
    ])
  ) {
    return { intent: 'RESTART_BOOKING', confidence: 'high' };
  }

  const explicitNewBooking = hasAny(normalized, [
    /\b(otro|otra)\s+(servicio|reserva|cita)\b/,
    /\b(agendar|reservar|contratar)\s+(otra|de\s+nuevo|nuevamente|otra\s+vez)\b/,
    /\bquiero\s+(otro|otra\s+vez|reservar|agendar|contratar)\b/,
    /\bnuevo\s+servicio\b/,
  ]);

  if (
    !explicitNewBooking &&
    (mentionedEmployee ||
      hasAny(normalized, [
        /\b(otra|otra\s+chica|otra\s+empleada|otra\s+modelo)\b/,
        /\b(cambiar|cambio|mejor)\s+(de\s+)?(chica|empleada|modelo)\b/,
      ]))
  ) {
    return {
      intent: 'CHANGE_EMPLOYEE',
      employeeName: mentionedEmployee,
      confidence: mentionedEmployee ? 'high' : 'medium',
    };
  }

  if (explicitNewBooking) {
    return {
      intent: 'START_NEW_BOOKING',
      employeeName: mentionedEmployee,
      confidence: 'high',
    };
  }

  if (
    hasAny(normalized, [
      /\b(estado|estatus|status)\b/,
      /\b(c[oó]mo\s+va|que\s+paso|qu[eé]\s+paso)\b/,
    ])
  ) {
    return { intent: 'ASK_STATUS', confidence: 'medium' };
  }

  if (
    hasAny(normalized, [/\b(hola|buenas|regrese|regrese)\b/, /^continuar$/])
  ) {
    return { intent: 'CONTINUE_BOOKING', confidence: 'medium' };
  }

  if (
    hasAny(normalized, [
      /\b(horas?|duraci[oó]n|ubicaci[oó]n|pin|pago|efectivo|tarjeta|transferencia)\b/,
      /^\d{1,2}$/,
    ])
  ) {
    return { intent: 'PROVIDE_EXPECTED_DATA', confidence: 'medium' };
  }

  if (
    normalized.endsWith('?') ||
    /^\b(acepta|puedo|tienen|cuanto|cu[aá]l|d[oó]nde)\b/.test(normalized)
  ) {
    return { intent: 'GENERAL_QUESTION', confidence: 'medium' };
  }

  return { intent: 'UNKNOWN', confidence: 'low' };
}

export function nextMissingRequirement(
  requirements: BookingRequirements,
): 'employee' | 'duration' | 'location' | 'payment' | 'confirmation' | null {
  if (!requirements.employeeId) return 'employee';
  if (!requirements.durationHours && !requirements.openEnded) return 'duration';
  if (!requirements.locationConfirmed) return 'location';
  if (!requirements.paymentMethod) return 'payment';
  if (requirements.confirmationReceived === false) return 'confirmation';
  return null;
}

export function isTerminalBookingStatus(status?: BookingStatus): boolean {
  return Boolean(status && TERMINAL_BOOKING_STATUSES.includes(status));
}

export function canConsumeBookingMessage(status?: BookingStatus): boolean {
  return (
    status === 'COLLECTING' || status === 'READY' || status === 'STALE_PENDING'
  );
}

export function transitionBookingStatus(
  from: BookingStatus,
  to: BookingStatus,
): BookingStatus {
  if (from === to) return from;
  if (isTerminalBookingStatus(from)) {
    throw new Error(`Terminal booking cannot transition from ${from}`);
  }
  const allowed: Record<BookingStatus, readonly BookingStatus[]> = {
    IDLE: ['COLLECTING'],
    COLLECTING: ['READY', 'CANCELLED', 'ABANDONED', 'STALE_PENDING'],
    READY: ['COLLECTING', 'SERVICE_CREATED', 'CANCELLED', 'ABANDONED'],
    STALE_PENDING: ['COLLECTING', 'ABANDONED', 'CANCELLED'],
    SERVICE_CREATED: [],
    CANCELLED: [],
    ABANDONED: [],
  };
  if (!allowed[from].includes(to)) {
    throw new Error(`Invalid booking transition ${from} -> ${to}`);
  }
  return to;
}

export function isBookingStale(
  lastInteractionAt: Date | string | undefined,
  now = Date.now(),
  ttlMs = 6 * 60 * 60 * 1000,
): boolean {
  if (!lastInteractionAt) return false;
  const timestamp = new Date(lastInteractionAt).getTime();
  return Number.isFinite(timestamp) && now - timestamp >= ttlMs;
}

export function registerLoopFailure(
  state: LoopBreakerState,
  step: string | undefined,
  intent: GlobalBookingIntent,
  maxFailures = DEFAULT_LOOP_BREAKER_MAX_FAILURES,
): { state: LoopBreakerState; shouldEscalate: boolean } {
  const sameTurn = state.lastStep === step && state.lastIntent === intent;
  const next: LoopBreakerState = {
    lastStep: step,
    lastIntent: intent,
    failureCount: sameTurn ? state.failureCount + 1 : 1,
  };
  return { state: next, shouldEscalate: next.failureCount >= maxFailures };
}

export function clearLoopFailures(): LoopBreakerState {
  return { failureCount: 0 };
}
