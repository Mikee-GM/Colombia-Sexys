import { TelegramBookingUpdate } from './telegram-booking.update';
import { APP_LOCALE } from '../common/locale';

/**
 * Los extras que no entran en el total.
 *
 * En la conversacion que motivo esto el cliente dijo dos veces que lo que
 * principalmente queria era el oral --$1,500 aparte, cotizado por ella misma en
 * el chat-- y el desglose final le dijo "en total serian $3,000". Iba a llegar
 * al motel con tres mil pesos y le iban a cobrar cuatro mil quinientos.
 */
type Privados = {
  avisoDeExtrasPendientes(
    session: unknown,
    empleadaId: string,
    formatoMoneda: Intl.NumberFormat,
    escapeMd: (texto: string) => string,
  ): Promise<string>;
  extrasCatalogoRepository: { find: jest.Mock };
  logger: { warn: jest.Mock };
};

const formatoMoneda = new Intl.NumberFormat(APP_LOCALE, {
  style: 'currency',
  currency: 'MXN',
});
const escapeMd = (texto: string) => texto.replace(/([_*[`])/g, '\\$1');

function nuevaInstancia(find: jest.Mock) {
  const instancia = Object.create(
    TelegramBookingUpdate.prototype,
  ) as TelegramBookingUpdate;
  const privados = instancia as unknown as Privados;
  privados.extrasCatalogoRepository = { find };
  privados.logger = { warn: jest.fn() };
  return privados;
}

const ORAL = { nombre: 'Oral con terminación en boca', precio: 1500 };
const PAREJAS = { nombre: 'Atención a parejas', precio: 900 };

const sesionCon = (mensajesDeElla: string[]) => ({
  chatHistory: mensajesDeElla.map((text) => ({
    role: 'model' as const,
    parts: [{ text }],
  })),
});

const aviso = (privados: Privados, session: unknown) =>
  privados.avisoDeExtrasPendientes(session, 'emp-1', formatoMoneda, escapeMd);

describe('Aviso de extras fuera del total', () => {
  it('avisa del extra que ella ya cotizó, con su precio', async () => {
    const privados = nuevaInstancia(
      jest.fn().mockResolvedValue([ORAL, PAREJAS]),
    );
    const session = sesionCon([
      'Uy mor, el oral con terminación en boca es $1500 extra, pero eso lo vemos en persona',
    ]);

    const texto = await aviso(privados, session);

    expect(texto).toContain('Oral con terminación en boca');
    expect(texto).toContain('1,500');
    expect(texto).toContain('va aparte');
    // El extra que nunca salió en la charla no se le mete por la cara.
    expect(texto).not.toContain('Atención a parejas');
  });

  it('concuerda el plural cuando son varios', async () => {
    const privados = nuevaInstancia(
      jest.fn().mockResolvedValue([ORAL, PAREJAS]),
    );
    const session = sesionCon([
      'El oral con terminación en boca son $1500',
      'La atención a parejas son $900 mor',
    ]);

    const texto = await aviso(privados, session);

    expect(texto).toContain('van aparte');
    expect(texto).toContain('están');
  });

  it('no dice nada si en la charla no salió ningún extra', async () => {
    const privados = nuevaInstancia(jest.fn().mockResolvedValue([ORAL]));
    const session = sesionCon(['Perfecto mi vida, una hora entonces']);

    await expect(aviso(privados, session)).resolves.toBe('');
  });

  it('no dice nada si la empleada no tiene extras', async () => {
    const privados = nuevaInstancia(jest.fn().mockResolvedValue([]));
    const session = sesionCon(['El oral con terminación en boca son $1500']);

    await expect(aviso(privados, session)).resolves.toBe('');
  });

  it('no dice nada sin historial de conversación', async () => {
    const find = jest.fn().mockResolvedValue([ORAL]);
    const privados = nuevaInstancia(find);

    await expect(aviso(privados, {})).resolves.toBe('');
    // Ni siquiera se consulta la base cuando no hay nada que cruzar.
    expect(find).not.toHaveBeenCalled();
  });

  /*
   * Un fallo leyendo los extras no puede tumbar la cotizacion: el cliente
   * prefiere un total sin nota al pie que quedarse sin total.
   */
  it('deja pasar la cotización si la consulta de extras falla', async () => {
    const privados = nuevaInstancia(
      jest.fn().mockRejectedValue(new Error('sin conexión')),
    );
    const session = sesionCon(['El oral con terminación en boca son $1500']);

    await expect(aviso(privados, session)).resolves.toBe('');
    expect(privados.logger.warn).toHaveBeenCalled();
  });
});
