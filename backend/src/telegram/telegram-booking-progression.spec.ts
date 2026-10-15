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

  it('suaviza la respuesta brusca observada sin cambiar la regla comercial', () => {
    const update = Object.create(TelegramBookingUpdate.prototype) as any;
    update.logger = { warn: jest.fn() };

    const result = update.dressAiReply(
      'En una hora es solo una relación completa, no las que quieras. Si buscas más, contratas más tiempo.',
    );

    expect(result).toContain('una relación completa');
    expect(result).toContain('podemos ver cuánto tiempo te acomoda');
    expect(result).not.toContain('no las que quieras');
    expect(result).not.toContain('contratas más tiempo');
  });
});
