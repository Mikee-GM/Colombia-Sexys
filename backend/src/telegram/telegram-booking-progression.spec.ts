import { TelegramBookingUpdate } from './telegram-booking.update';

describe('TelegramBookingUpdate booking progression', () => {
  it('does not ask for duration again after it was confirmed', () => {
    const update = Object.create(TelegramBookingUpdate.prototype) as any;
    update.logger = { warn: jest.fn() };
    update.hasConfirmedLocation = jest.fn(() => false);

    const result = update.enforceBookingProgression(
      'No alcancé a entender cuántas horas quieres, mor. ¿Cuánto tiempo vamos a estar juntos?',
      { duracionPactadaHoras: 1 },
    );

    expect(result).toContain('ya tengo tu horita confirmada');
    expect(result).toContain('moteles');
    expect(update.logger.warn).toHaveBeenCalled();
  });

  it('advances to payment when duration and location are already confirmed', () => {
    const update = Object.create(TelegramBookingUpdate.prototype) as any;
    update.logger = { warn: jest.fn() };
    update.hasConfirmedLocation = jest.fn(() => true);

    const result = update.enforceBookingProgression('¿Cuántas horas quieres?', {
      duracionPactadaHoras: 1,
    });

    expect(result).toContain('Cómo prefieres pagar');
  });
});
