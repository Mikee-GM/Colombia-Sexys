import { Telegraf } from 'telegraf';
import { installSendThrottle } from './telegram-send-throttle';

type Call = { method: string; at: number };

function fakeBot(behaviour?: (method: string, call: number) => unknown) {
  const calls: Call[] = [];
  let n = 0;
  const telegram = {
    callApi: (method: string, _payload: unknown) => {
      calls.push({ method, at: Date.now() });
      const outcome = behaviour?.(method, n++);
      if (outcome instanceof Error) return Promise.reject(outcome);
      return Promise.resolve(outcome ?? { ok: true });
    },
  };
  const bot = { telegram } as unknown as Telegraf<never>;
  return { bot, telegram, calls };
}

const rateLimited = (retryAfter: number) =>
  Object.assign(new Error('429'), {
    response: { error_code: 429, parameters: { retry_after: retryAfter } },
  });

describe('installSendThrottle', () => {
  beforeEach(() => jest.useFakeTimers({ doNotFake: ['nextTick'] }));
  afterEach(() => jest.useRealTimers());

  it('no toca los métodos que no envían nada', async () => {
    const { bot, telegram, calls } = fakeBot();
    installSendThrottle(bot, 'test');

    await (telegram.callApi as any)('getMe', {});
    await (telegram.callApi as any)('setWebhook', {});

    expect(calls.map((c) => c.method)).toEqual(['getMe', 'setWebhook']);
  });

  it('reintenta un 429 respetando el retry_after que pide Telegram', async () => {
    const { bot, telegram, calls } = fakeBot((method, call) =>
      method === 'sendMessage' && call === 0 ? rateLimited(2) : undefined,
    );
    installSendThrottle(bot, 'test');

    const enviado = (telegram.callApi as any)('sendMessage', { chat_id: 1 });
    await jest.advanceTimersByTimeAsync(2_100);

    await expect(enviado).resolves.toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it('abandona si Telegram pide una espera desproporcionada', async () => {
    const { bot, telegram, calls } = fakeBot(() => rateLimited(120));
    installSendThrottle(bot, 'test');

    const enviado = (telegram.callApi as any)('sendMessage', { chat_id: 1 });
    await expect(enviado).rejects.toThrow('429');
    expect(calls).toHaveLength(1);
  });

  it('propaga los errores que no son de límite sin reintentar', async () => {
    const { bot, telegram, calls } = fakeBot(() =>
      Object.assign(new Error('chat no encontrado'), {
        response: { error_code: 400 },
      }),
    );
    installSendThrottle(bot, 'test');

    await expect(
      (telegram.callApi as any)('sendMessage', { chat_id: 1 }),
    ).rejects.toThrow('chat no encontrado');
    expect(calls).toHaveLength(1);
  });

  it('separa los envíos seguidos al mismo chat', async () => {
    const { bot, telegram, calls } = fakeBot();
    installSendThrottle(bot, 'test');

    const primero = (telegram.callApi as any)('sendMessage', { chat_id: 7 });
    const segundo = (telegram.callApi as any)('sendMessage', { chat_id: 7 });

    await primero;
    expect(calls).toHaveLength(1);

    await jest.advanceTimersByTimeAsync(1_100);
    await segundo;
    expect(calls).toHaveLength(2);
    expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(1_000);
  });

  it('no se instala dos veces sobre el mismo bot', () => {
    const { bot, telegram } = fakeBot();
    installSendThrottle(bot, 'test');
    const wrapped = telegram.callApi;
    installSendThrottle(bot, 'test');

    expect(telegram.callApi).toBe(wrapped);
  });
});
