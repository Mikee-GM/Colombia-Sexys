import { Logger } from '@nestjs/common';
import { Telegraf } from 'telegraf';

/**
 * Telegram acepta unos 30 mensajes por segundo por bot. Se deja margen: pasarse
 * no da un error util, da un 429 que corta la rafaga entera.
 */
const GLOBAL_PER_SECOND = 25;
/** Y como mucho uno por segundo al mismo chat. */
const PER_CHAT_INTERVAL_MS = 1_000;
/** Reintentos ante un 429 antes de darlo por perdido. */
const MAX_RETRIES = 3;
/** Un `retry_after` mayor que esto no compensa esperarlo dentro de la peticion. */
const MAX_RETRY_WAIT_MS = 30_000;

/** Metodos que envian algo a un chat y por tanto consumen cuota. */
const SENDING_METHODS = new Set([
  'sendMessage',
  'sendPhoto',
  'sendVideo',
  'sendAnimation',
  'sendDocument',
  'sendAudio',
  'sendVoice',
  'sendMediaGroup',
  'sendLocation',
  'sendVenue',
  'sendContact',
  'sendSticker',
  'sendDice',
  'sendPoll',
  'sendChatAction',
  'editMessageText',
  'editMessageCaption',
  'editMessageMedia',
  'editMessageReplyMarkup',
  'copyMessage',
  'forwardMessage',
]);

type ApiError = {
  response?: { error_code?: number; parameters?: { retry_after?: number } };
};

/**
 * Pone un limite de ritmo a todo lo que el bot envia a Telegram.
 *
 * Se envuelve `callApi`, que es por donde pasan todos los metodos del cliente,
 * en vez de cada punto de envio: hay cientos repartidos por los `@Update()`, y
 * lo que hay que limitar es el bot entero, no cada sitio por separado.
 *
 * Sin esto, los envios masivos —contenido semanal, onboarding, reparto de
 * ofertas a los choferes— salian en rafaga y Telegram devolvia 429. Como cada
 * envio vive dentro de un `try/catch` que registra y sigue, el mensaje no
 * llegaba y el flujo continuaba como si hubiera llegado: una oferta de viaje
 * que nadie ve es un viaje que se queda sin chofer.
 */
export function installSendThrottle(
  bot: Telegraf<never> | Telegraf<any>,
  label: string,
): void {
  const telegram = bot.telegram as unknown as {
    callApi: (
      method: string,
      payload: unknown,
      ...rest: unknown[]
    ) => Promise<unknown>;
    __throttled?: boolean;
  };
  if (telegram.__throttled) return;

  const logger = new Logger(`TelegramThrottle:${label}`);
  const original = telegram.callApi.bind(telegram);

  // Instantes de los envios recientes, para el limite global por segundo.
  let recent: number[] = [];
  // Cuando queda libre cada chat, para el limite de uno por segundo.
  const chatFreeAt = new Map<string, number>();
  // Cola: cada envio espera a que el anterior haya cogido su turno.
  let queue: Promise<void> = Promise.resolve();

  const reserve = (chatId: string | undefined): Promise<void> => {
    const turn = queue.then(async () => {
      for (;;) {
        const now = Date.now();
        recent = recent.filter((t) => now - t < 1_000);

        const globalWait =
          recent.length >= GLOBAL_PER_SECOND ? 1_000 - (now - recent[0]) : 0;
        const chatWait = chatId ? (chatFreeAt.get(chatId) ?? 0) - now : 0;
        const wait = Math.max(globalWait, chatWait, 0);

        if (wait <= 0) {
          recent.push(now);
          if (chatId) chatFreeAt.set(chatId, now + PER_CHAT_INTERVAL_MS);
          // La tabla de chats crece con cada destinatario: se poda de los que
          // ya cumplieron su espera.
          if (chatFreeAt.size > 5_000) {
            for (const [key, freeAt] of chatFreeAt)
              if (freeAt <= now) chatFreeAt.delete(key);
          }
          return;
        }
        await sleep(wait);
      }
    });
    queue = turn.catch(() => undefined);
    return turn;
  };

  telegram.callApi = async (method, payload, ...rest) => {
    if (!SENDING_METHODS.has(method)) return original(method, payload, ...rest);

    const chatId = readChatId(payload);

    for (let attempt = 0; ; attempt++) {
      await reserve(chatId);
      try {
        return await original(method, payload, ...rest);
      } catch (error) {
        const retryAfter = readRetryAfter(error);
        if (retryAfter === null || attempt >= MAX_RETRIES) throw error;

        const waitMs = retryAfter * 1_000;
        if (waitMs > MAX_RETRY_WAIT_MS) {
          logger.warn(
            `Telegram pide esperar ${retryAfter}s para ${method}; es demasiado y se abandona el envio.`,
          );
          throw error;
        }
        logger.warn(
          `429 en ${method}: se reintenta en ${retryAfter}s (intento ${attempt + 1}/${MAX_RETRIES}).`,
        );
        await sleep(waitMs);
      }
    }
  };
  telegram.__throttled = true;
}

/** El `retry_after` que acompaña a un 429, o `null` si el error es otro. */
function readRetryAfter(error: unknown): number | null {
  const response = (error as ApiError)?.response;
  if (response?.error_code !== 429) return null;
  return response.parameters?.retry_after ?? 1;
}

function readChatId(payload: unknown): string | undefined {
  const chatId = (payload as { chat_id?: string | number } | undefined)
    ?.chat_id;
  return chatId === undefined ? undefined : String(chatId);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}
