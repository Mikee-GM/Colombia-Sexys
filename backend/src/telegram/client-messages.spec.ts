import { clientMessages } from './client-messages';

describe('clientMessages', () => {
  it('pide la ubicación como una continuación natural de la conversación', () => {
    const message = clientMessages.paymentAndLocation(3, 'tarjeta');

    expect(message).toContain('ya quedó anotado');
    expect(message).toContain('3 horas');
    expect(message).toContain('TARJETA');
    expect(message).toContain('compárteme tu ubicación');
  });

  it('notifica el trayecto en primera persona de la empleada', () => {
    const message = clientMessages.onTheWay('Fernanda', 'Luis');

    expect(message).toContain('Ya voy en camino contigo');
    expect(message).toContain('Soy *Fernanda*');
    expect(message).toContain('chofer *Luis*');
  });

  it('confirma la llegada como la empleada', () => {
    const message = clientMessages.arrived('Fernanda');

    expect(message).toContain('Ya llegué');
    expect(message).toContain('Soy *Fernanda*');
  });
});
