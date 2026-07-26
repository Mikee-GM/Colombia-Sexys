import {
  detectGroupServiceIntent,
  extractHireDuration,
  extractHirePaymentMethod,
  isUberAdminInputSession,
  parseUberFareInput,
} from './telegram-booking.update';

describe('Telegram booking session input parsing', () => {
  it.each([
    ['quiero dos chicas para el servicio', 'grupal'],
    ['busco un servicio grupal', 'grupal'],
    ['puedes venir con una amiga', 'incierta'],
    ['quiero dos horas contigo', 'individual'],
  ])('clasifica la intención de %s como %s', (text, expected) => {
    expect(detectGroupServiceIntent(text)).toBe(expected);
  });

  it.each([
    ['2', 2],
    ['quiero 3 horas', 3],
    ['cuatro horas por favor', 4],
    ['dos horas', 2],
    ['una hora por favor', 1],
  ])('extracts a valid duration from %s', (text, expected) => {
    expect(extractHireDuration(text)).toBe(expected);
  });

  it.each(['efectivo', 'Prefiero pagar con tarjeta', 'por transferencia'])(
    'extracts a supported payment method from %s',
    (text) => {
      expect(extractHirePaymentMethod(text)).toBe(
        text.toLowerCase().includes('efectivo')
          ? 'efectivo'
          : text.toLowerCase().includes('tarjeta')
            ? 'tarjeta'
            : 'transferencia',
      );
    },
  );

  it('does not infer invalid booking data', () => {
    expect(extractHireDuration('todavía no sé')).toBeUndefined();
    expect(extractHireDuration('0 horas')).toBeUndefined();
    expect(extractHireDuration('2.5 horas')).toBeUndefined();
    expect(extractHireDuration('25 horas')).toBeUndefined();
    expect(extractHirePaymentMethod('luego te digo')).toBeUndefined();
  });

  it.each([
    'AWAITING_UBER_SCREENSHOT',
    'AWAITING_UBER_FARE_ACTION',
    'AWAITING_UBER_FARE',
  ])('reserves %s for the administrative Uber flow', (step) => {
    expect(isUberAdminInputSession({ step })).toBe(true);
  });

  it('allows ordinary messages through the conversation router', () => {
    expect(isUberAdminInputSession({ step: 'CHAT_CON_EMPLEADA' })).toBe(false);
    expect(isUberAdminInputSession(undefined)).toBe(false);
  });

  it.each([
    ['185', 185],
    ['185.50', 185.5],
    ['185,5', 185.5],
  ])('parses the Uber fare %s', (text, expected) => {
    expect(parseUberFareInput(text)).toBe(expected);
  });

  it.each(['0', '-20', '185.555', 'abc'])(
    'rejects the invalid Uber fare %s',
    (text) => {
      expect(parseUberFareInput(text)).toBeUndefined();
    },
  );
});
