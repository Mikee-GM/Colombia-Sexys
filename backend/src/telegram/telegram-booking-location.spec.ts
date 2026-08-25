import { TelegramBookingUpdate } from './telegram-booking.update';

/**
 * El manejador vive en una clase con dos docenas de dependencias inyectadas.
 * Estas pruebas cubren la lógica que causó el fallo, así que se invocan sus
 * métodos sobre un objeto vacío en lugar de levantar el módulo entero.
 */
type Privados = {
  messageBufferKey(telegramId: string, empleadaId: string): string;
  adelantarBufferDelCliente(telegramId: string, empleadaId: string): boolean;
  recordLocationInHistory(
    session: Record<string, unknown>,
    descripcion?: string | null,
  ): void;
  clientMessageBuffers: Map<string, unknown>;
  flushClientMessageBuffer: unknown;
};

const comoPrivados = (instancia: unknown) => instancia as Privados;

function nuevaInstancia() {
  const instancia = Object.create(
    TelegramBookingUpdate.prototype,
  ) as TelegramBookingUpdate;
  const privados = comoPrivados(instancia);
  privados.clientMessageBuffers = new Map();
  return { instancia, privados };
}

describe('Llegada del pin de ubicación', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /**
   * El fallo que cubre esta prueba: el texto del cliente se agrupa 20 s antes
   * de pasárselo a la IA. Si en mitad de esa ventana llegaba el pin —que tiene
   * su propio manejador y contesta al instante—, el cliente recibía un acuse
   * automático y, casi veinte segundos después, una respuesta de la IA que
   * ignoraba el pin y volvía a pedir la ubicación.
   */
  it('adelanta el vaciado del buffer cuando llega el pin', () => {
    const { instancia, privados } = nuevaInstancia();
    const flush = jest.fn();
    (
      instancia as unknown as { flushClientMessageBuffer: unknown }
    ).flushClientMessageBuffer = flush;

    const clave = privados.messageBufferKey('99', 'emp-1');
    const empleada = { id: 'emp-1' } as never;
    const timerOriginal = setTimeout(() => flush(clave, empleada), 20_000);
    privados.clientMessageBuffers.set(clave, {
      messages: ['si, ahorita te mando el pin'],
      timer: timerOriginal,
      ctx: {},
      empleada,
    });

    expect(privados.adelantarBufferDelCliente('99', 'emp-1')).toBe(true);

    // A los 20 s originales ya tendría que haber corrido hace mucho.
    jest.advanceTimersByTime(2_000);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(clave, empleada);
  });

  it('no adelanta nada si el cliente no tenía mensajes pendientes', () => {
    const { privados } = nuevaInstancia();
    expect(privados.adelantarBufferDelCliente('99', 'emp-1')).toBe(false);
  });

  it('distingue el buffer de cada modelo para el mismo cliente', () => {
    const { privados } = nuevaInstancia();
    privados.clientMessageBuffers.set(
      privados.messageBufferKey('99', 'emp-1'),
      {
        messages: [],
        timer: setTimeout(() => undefined, 20_000),
        ctx: {},
        empleada: {},
      },
    );
    expect(privados.adelantarBufferDelCliente('99', 'emp-2')).toBe(false);
  });

  /**
   * El prompt ya llevaba la ubicación confirmada, pero el modelo se guía por el
   * hilo de la conversación y ahí el pin no aparecía: como su último turno
   * había sido pedir la ubicación, la volvía a pedir.
   */
  it('deja constancia del pin en el historial, como turno del cliente', () => {
    const { privados } = nuevaInstancia();
    const session: Record<string, unknown> = {
      chatHistory: [
        { role: 'model', parts: [{ text: 'Mándame tu ubicación' }] },
      ],
    };

    privados.recordLocationInHistory(session, 'Motel Las Palmas');

    const history = session.chatHistory as {
      role: string;
      parts: { text: string }[];
    }[];
    const ultimo = history[history.length - 1];
    expect(ultimo.role).toBe('user');
    expect(ultimo.parts[0].text).toContain('Motel Las Palmas');
    expect(ultimo.parts[0].text).toMatch(/ubicaci[oó]n/i);
  });

  it('registra el pin aunque no se sepa el nombre del lugar', () => {
    const { privados } = nuevaInstancia();
    const session: Record<string, unknown> = {};

    privados.recordLocationInHistory(session, null);

    const history = session.chatHistory as { role: string }[];
    expect(history).toHaveLength(1);
    expect(history[0].role).toBe('user');
  });
});
