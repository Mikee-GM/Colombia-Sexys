import { Context, Telegraf } from 'telegraf';
import {
  installTelegramTransport,
  isDummyTelegramToken,
} from './telegram-transport';

function fakeBot() {
  const externalCall = jest.fn().mockResolvedValue({ live: true });
  const telegram = { callApi: externalCall };
  const bot = { telegram } as unknown as Telegraf<Context>;
  return { bot, telegram, externalCall };
}

describe('installTelegramTransport', () => {
  it('detecta el marcador dummy sin depender de mayusculas', () => {
    expect(isDummyTelegramToken('123:dummy-local')).toBe(true);
    expect(isDummyTelegramToken('123:DUMMY-local')).toBe(true);
    expect(isDummyTelegramToken('123:token-real')).toBe(false);
  });

  it('simula todo el Bot API sin invocar el transporte externo', async () => {
    const { bot, telegram, externalCall } = fakeBot();

    expect(installTelegramTransport(bot, '123:dummy-local', 'test')).toBe(
      'dummy',
    );

    const methods = [
      'setMyCommands',
      'sendMessage',
      'editMessageText',
      'editMessageReplyMarkup',
      'answerCallbackQuery',
      'sendPhoto',
      'sendDocument',
      'deleteMessage',
    ];
    const results = await Promise.all(
      methods.map((method) =>
        telegram.callApi(method, { chat_id: 42, text: 'QA' }),
      ),
    );

    expect(externalCall).not.toHaveBeenCalled();
    expect(results[1]).toMatchObject({ chat: { id: 42 }, text: 'QA' });
    expect(results[2]).toMatchObject({ chat: { id: 42 }, text: 'QA' });
    expect(results[5]).toMatchObject({ chat: { id: 42 } });
    expect(results[0]).toBe(true);
    expect(results[4]).toBe(true);
    expect(results[7]).toBe(true);
  });

  it('devuelve formas compatibles para archivos, albumes y temas', async () => {
    const { bot, telegram } = fakeBot();
    installTelegramTransport(bot, '123:dummy', 'test');

    await expect(
      telegram.callApi('getFile', { file_id: 'photo-1' }),
    ).resolves.toMatchObject({
      file_id: 'photo-1',
      file_path: 'dummy/file',
    });
    await expect(
      telegram.callApi('sendMediaGroup', {
        chat_id: 7,
        media: [{ type: 'photo' }, { type: 'photo' }],
      }),
    ).resolves.toHaveLength(2);
    await expect(
      telegram.callApi('createForumTopic', { chat_id: 7, name: 'QA' }),
    ).resolves.toMatchObject({ name: 'QA' });
  });

  it('con token normal conserva el transporte real y el limitador', async () => {
    const { bot, telegram, externalCall } = fakeBot();

    expect(installTelegramTransport(bot, '123:token-real', 'test')).toBe(
      'live',
    );
    await expect(telegram.callApi('getMe', {})).resolves.toEqual({
      live: true,
    });

    expect(externalCall).toHaveBeenCalledTimes(1);
    expect(externalCall).toHaveBeenCalledWith('getMe', {});
  });

  it('solo instala un transporte por instancia de bot', () => {
    const { bot, telegram } = fakeBot();
    installTelegramTransport(bot, '123:dummy', 'test');
    const installed = telegram.callApi;

    expect(installTelegramTransport(bot, '123:token-real', 'test')).toBe(
      'dummy',
    );
    expect(telegram.callApi).toBe(installed);
  });
});
