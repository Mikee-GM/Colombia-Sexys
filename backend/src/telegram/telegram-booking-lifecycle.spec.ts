import {
  DEFAULT_LOOP_BREAKER_MAX_FAILURES,
  detectGlobalBookingIntent,
  isBookingStale,
  nextMissingRequirement,
  registerLoopFailure,
  transitionBookingStatus,
} from './telegram-booking-lifecycle';

describe('telegram booking lifecycle', () => {
  it.each([
    ['quiero otro servicio', 'START_NEW_BOOKING'],
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
    const old = new Date(Date.now() - 7 * 60 * 60 * 1000);
    expect(isBookingStale(old, Date.now(), 6 * 60 * 60 * 1000)).toBe(true);
    expect(isBookingStale(new Date(), Date.now(), 6 * 60 * 60 * 1000)).toBe(
      false,
    );
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
