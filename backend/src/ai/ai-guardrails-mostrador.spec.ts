import { stripFrontDeskOffer } from './ai-guardrails';

/**
 * El fallo que cubren estas pruebas: el primer mensaje que veia todo cliente
 * nuevo terminaba en "¿en que te puedo ayudar? 😊". Es la coletilla de un call
 * center y delata al personaje tanto como decir que hay un bot detras. El
 * prompt ya pedia que el saludo fuera solo tarifa y disponibilidad, y aun asi
 * el modelo la ponia, asi que se quita aqui.
 */
describe('Ofrecimiento de mostrador en la respuesta de la IA', () => {
  it('quita la coletilla y deja el saludo con su tarifa', () => {
    expect(
      stripFrontDeskOffer(
        'Hola amor, ¿qué tal? Estoy disponible por $2500 la hora, ¿en qué te puedo ayudar? 😊',
      ),
    ).toBe('Hola amor, ¿qué tal? Estoy disponible por $2500 la hora 😊');
  });

  it('quita también las variantes de servir y atender', () => {
    expect(stripFrontDeskOffer('Hola papi. ¿En qué te puedo servir?')).toBe(
      'Hola papi.',
    );
    expect(stripFrontDeskOffer('Buenas. ¿Cómo te puedo atender hoy?')).toBe(
      'Buenas.',
    );
    // La coma que unía la coletilla al saludo se va con ella.
    expect(stripFrontDeskOffer('Hola mor, estoy para servirte.')).toBe(
      'Hola mor',
    );
  });

  it('no toca los mensajes que no la llevan', () => {
    const normal =
      'Uy qué rico, 3 horitas en Montecarlo. ¿Cómo prefieres pagar, mi vida?';
    expect(stripFrontDeskOffer(normal)).toBe(normal);
  });

  /**
   * "Ayudar" fuera de la formula es una palabra normal: si se quitara la frase
   * entera cada vez que aparece, se perderian respuestas legitimas.
   */
  it('no confunde un "ayudar" cualquiera con la coletilla', () => {
    const frase = 'Ay mor, eso no me ayuda mucho, dime mejor cuántas horas.';
    expect(stripFrontDeskOffer(frase)).toBe(frase);
  });

  it('deja el mensaje vacío si no era más que la coletilla', () => {
    expect(stripFrontDeskOffer('¿En qué te puedo ayudar?')).toBe('');
  });
});
