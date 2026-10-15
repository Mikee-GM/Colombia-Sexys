import {
  DEFAULT_LOOP_BREAKER_MAX_FAILURES,
  BOOKING_INACTIVITY_TTL_MS,
  detectGlobalBookingIntent,
  isBookingStale,
  nextMissingRequirement,
  registerLoopFailure,
  shouldExpireUncontractedBooking,
  transitionBookingStatus,
} from './telegram-booking-lifecycle';

describe('telegram booking lifecycle', () => {
  it.each([
    ['quiero otro servicio', 'START_NEW_BOOKING'],
    ['1hr bb', 'PROVIDE_EXPECTED_DATA'],
    ['mejor quiero a Paula', 'CHANGE_EMPLOYEE'],
    ['reiniciar desde cero', 'RESTART_BOOKING'],
    ['cancelar la solicitud', 'CANCEL_BOOKING'],
    ['quiero hablar con una persona', 'REQUEST_HUMAN'],
    ['en qué estado va', 'ASK_STATUS'],
  ])('prioriza la intención global para %s', (text, intent) => {
    expect(
      detectGlobalBookingIntent(text, {
        employeeNames: ['Andrea', 'Paula'],
      }).intent,
    ).toBe(intent);
  });

  it('resuelve la empleada mencionada sin depender de la IA', () => {
    expect(
      detectGlobalBookingIntent('mejor con paula', {
        employeeNames: ['Andrea', 'Paula'],
      }),
    ).toEqual({
      intent: 'CHANGE_EMPLOYEE',
      employeeName: 'Paula',
      confidence: 'high',
    });
  });

  it('mantiene una sola siguiente acción pendiente', () => {
    expect(
      nextMissingRequirement({
        employeeId: 'employee-1',
        durationHours: 2,
        locationConfirmed: true,
        paymentMethod: null,
      }),
    ).toBe('payment');
    expect(
      nextMissingRequirement({
        employeeId: 'employee-1',
        durationHours: 2,
        locationConfirmed: true,
        paymentMethod: 'efectivo',
      }),
    ).toBeNull();
  });

  it('impide que una sesión terminal vuelva a recopilar datos', () => {
    expect(() =>
      transitionBookingStatus('SERVICE_CREATED', 'COLLECTING'),
    ).toThrow('Terminal booking');
    expect(transitionBookingStatus('COLLECTING', 'ABANDONED')).toBe(
      'ABANDONED',
    );
  });

  it('detecta solicitudes viejas sin borrar su historial', () => {
    const old = new Date(Date.now() - BOOKING_INACTIVITY_TTL_MS - 1);
    expect(isBookingStale(old)).toBe(true);
    expect(isBookingStale(new Date())).toBe(false);
  });

  it('reinicia únicamente drafts privados sin actividad durante una hora', () => {
    const now = Date.now();
    const base = {
      chatType: 'private',
      status: 'COLLECTING' as const,
      lastInteractionAt: new Date(now - BOOKING_INACTIVITY_TTL_MS - 1),
      now,
    };

    expect(shouldExpireUncontractedBooking(base)).toBe(true);
    expect(
      shouldExpireUncontractedBooking({ ...base, hasCreatedService: true }),
    ).toBe(false);
    expect(
      shouldExpireUncontractedBooking({ ...base, humanTakeover: true }),
    ).toBe(false);
    expect(
      shouldExpireUncontractedBooking({
        ...base,
        lastInteractionAt: new Date(now - BOOKING_INACTIVITY_TTL_MS + 1),
      }),
    ).toBe(false);
  });

  it('entrega al humano tras tres mensajes no interpretables en el mismo paso', () => {
    let state = { failureCount: 0 };
    let escalated = false;
    for (let i = 0; i < DEFAULT_LOOP_BREAKER_MAX_FAILURES; i++) {
      const result = registerLoopFailure(state, 'AWAITING_LOCATION', 'UNKNOWN');
      state = result.state;
      escalated = result.shouldEscalate;
    }
    expect(state.failureCount).toBe(3);
    expect(escalated).toBe(true);
  });
});
