import { TelegramCallbackGuard } from './telegram-callback-guard';

/** Contexto minimo con lo unico que mira el guardia. */
function ctxDe(
  data: string,
  messageId = 10,
  chatId = 55,
): {
  callbackQuery: {
    data: string;
    message: { message_id: number; chat: { id: number } };
  };
  from: { id: number };
  answerCbQuery: jest.Mock;
} {
  return {
    callbackQuery: {
      data,
      message: { message_id: messageId, chat: { id: chatId } },
    },
    from: { id: chatId },
    answerCbQuery: jest.fn().mockResolvedValue(undefined),
  };
}

describe('TelegramCallbackGuard', () => {
  let guard: TelegramCallbackGuard;

  beforeEach(() => {
    guard = new TelegramCallbackGuard();
  });

  it('deja pasar la primera pulsacion', async () => {
    const ctx = ctxDe('conf_ja:srv-1:1');
    expect(await guard.esRepetido(ctx as never)).toBe(false);
  });

  /**
   * El caso que motiva todo esto: el jefe pulsa dos veces "Aceptar" porque el
   * primer toque tarda, y sin esto el servicio se procesaba por duplicado.
   */
  it('ignora el segundo toque del mismo boton y avisa a quien pulso', async () => {
    const primero = ctxDe('conf_ja:srv-1:1');
    const segundo = ctxDe('conf_ja:srv-1:1');

    expect(await guard.esRepetido(primero as never)).toBe(false);
    expect(await guard.esRepetido(segundo as never)).toBe(true);
    expect(segundo.answerCbQuery).toHaveBeenCalled();
  });

  it('no confunde dos botones distintos del mismo mensaje', async () => {
    const aceptar = ctxDe('conf_ja:srv-1:1');
    const rechazar = ctxDe('conf_ja:srv-1:0');

    expect(await guard.esRepetido(aceptar as never)).toBe(false);
    expect(await guard.esRepetido(rechazar as never)).toBe(false);
  });

  /**
   * Dos servicios distintos pueden mostrar botones con los mismos datos en
   * mensajes distintos; el mensaje forma parte de la clave para que uno no
   * bloquee al otro.
   */
  it('no confunde el mismo boton en dos mensajes distintos', async () => {
    expect(await guard.esRepetido(ctxDe('finalizar', 10) as never)).toBe(false);
    expect(await guard.esRepetido(ctxDe('finalizar', 11) as never)).toBe(false);
  });

  it('vuelve a admitir el boton cuando el manejador lo libera', async () => {
    const ctx = ctxDe('agregar_extra_pay:efectivo');
    expect(await guard.esRepetido(ctx as never)).toBe(false);

    guard.liberar(ctx as never);

    expect(
      await guard.esRepetido(ctxDe('agregar_extra_pay:efectivo') as never),
    ).toBe(false);
  });

  it('ignora un update que no trae boton', async () => {
    const ctx = { from: { id: 1 }, answerCbQuery: jest.fn() };
    expect(await guard.esRepetido(ctx as never)).toBe(false);
    expect(ctx.answerCbQuery).not.toHaveBeenCalled();
  });
});
