import { Logger } from '@nestjs/common';
import { Context, Telegraf } from 'telegraf';
import { installSendThrottle } from './telegram-send-throttle';

export type TelegramTransportMode = 'live' | 'dummy';

type TelegramApiClient = {
  callApi: (
    method: string,
    payload?: unknown,
    ...rest: unknown[]
  ) => Promise<unknown>;
  __transportMode?: TelegramTransportMode;
};

type TelegramPayload = Record<string, unknown>;

let dummyMessageId = 1_000_000_000;
let dummyThreadId = 1_000_000;

export function isDummyTelegramToken(token: string | undefined): boolean {
  return token?.toLowerCase().includes('dummy') ?? false;
}

/**
 * Instala el unico transporte de salida del bot.
 *
 * Telegraf implementa todos sus metodos publicos (`sendMessage`,
 * `setMyCommands`, ediciones, archivos, callbacks, etc.) sobre `callApi`.
 * Sustituirlo una sola vez permite que QA simule el canal completo sin que
 * cada servicio o programador tenga que conocer el modo dummy.
 */
export function installTelegramTransport(
  bot: Telegraf<Context>,
  token: string | undefined,
  label: string,
): TelegramTransportMode {
  const telegram = bot.telegram as unknown as TelegramApiClient;
  if (telegram.__transportMode) return telegram.__transportMode;

  if (!isDummyTelegramToken(token)) {
    installSendThrottle(bot, label);
    telegram.__transportMode = 'live';
    return 'live';
  }

  const logger = new Logger(`TelegramTransport:${label}`);
  telegram.callApi = (method, payload) =>
    Promise.resolve(buildDummyResponse(method, asPayload(payload)));
  telegram.__transportMode = 'dummy';
  logger.log(
    'Canal de Telegram simulado: ninguna llamada se enviara al Bot API.',
  );
  return 'dummy';
}

function buildDummyResponse(method: string, payload: TelegramPayload): unknown {
  if (method === 'getMe') {
    return {
      id: 1_234_567_890,
      is_bot: true,
      first_name: 'QA Dummy Bot',
      username: 'qa_bot',
    };
  }

  if (method === 'getFile') {
    const fileId = asTelegramString(payload.file_id, 'dummy-file');
    return {
      file_id: fileId,
      file_unique_id: `dummy-${fileId}`,
      file_path: 'dummy/file',
    };
  }

  if (method === 'createForumTopic') {
    return {
      message_thread_id: dummyThreadId++,
      name: asTelegramString(payload.name, 'Tema QA'),
      icon_color: 7_322_096,
    };
  }

  if (method === 'copyMessage') {
    return { message_id: nextMessageId() };
  }

  if (method === 'sendMediaGroup') {
    const media = Array.isArray(payload.media) ? payload.media : [];
    return media.map(() => buildDummyMessage(payload));
  }

  if (
    method.startsWith('send') ||
    method.startsWith('editMessage') ||
    method === 'forwardMessage'
  ) {
    return buildDummyMessage(payload);
  }

  // Los metodos administrativos, callbacks, borrados y webhooks devuelven
  // booleano en el Bot API. Para cualquier metodo nuevo, `true` mantiene el
  // flujo de negocio sin inventar una conexion externa.
  return true;
}

function buildDummyMessage(payload: TelegramPayload) {
  const chatId = parseChatId(payload.chat_id);
  return {
    message_id: nextMessageId(),
    date: Math.floor(Date.now() / 1_000),
    chat: { id: chatId, type: 'private' as const },
    ...(payload.text === undefined
      ? {}
      : { text: asTelegramString(payload.text, '') }),
    ...(payload.caption === undefined
      ? {}
      : { caption: asTelegramString(payload.caption, '') }),
  };
}

function parseChatId(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nextMessageId(): number {
  return dummyMessageId++;
}

function asPayload(payload: unknown): TelegramPayload {
  if (typeof payload !== 'object' || payload === null) return {};
  return payload as TelegramPayload;
}

function asTelegramString(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value;
  if (
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  return fallback;
}
