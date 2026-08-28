/**
 * Aviso de mudanza antes de apagar los bots dedicados de cada modelo.
 *
 * El sistema vuelve a tener un solo bot. El problema de apagar los dedicados
 * sin mas es que un bot solo puede escribirle a quien lo haya iniciado: los
 * clientes que unicamente abrieron conversacion con el bot de una modelo
 * quedarian inalcanzables desde el bot central hasta que ellos escribieran por
 * su cuenta, y no tienen forma de saber que deben hacerlo.
 *
 * Este script usa cada token dedicado --mientras siguen existiendo-- para
 * mandarle a esos clientes un enlace al bot central que reanuda la conversacion
 * con la misma modelo. Es de un solo uso: se ejecuta una vez, se comprueba el
 * resumen y despues ya se puede borrar la tabla.
 *
 * Es deliberadamente autonomo: no importa nada del codigo de la aplicacion
 * --ni el registro de bots, ni el servicio de cifrado, ni las entidades-- para
 * que siga funcionando en el mismo commit en el que todo eso desaparece.
 *
 * Uso, desde `backend/`:
 *
 *   corepack pnpm build
 *   node dist/scripts/despedir-bots-dedicados.js            # ensayo, no envia
 *   node dist/scripts/despedir-bots-dedicados.js --enviar   # envia de verdad
 */
import { createDecipheriv, createHash } from 'crypto';
import { AppDataSource } from '../data-source';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** Pausa entre envios. Telegram tolera ~30 mensajes por segundo por bot. */
const PAUSA_ENTRE_ENVIOS_MS = 120;

interface FilaBot {
  id: string;
  employee_id: string;
  token_ciphertext: string;
  nombre_artistico: string | null;
}

function claveDeCifrado(): Buffer {
  const raw = process.env.TELEGRAM_TOKEN_ENCRYPTION_KEY || '';
  if (!raw) {
    throw new Error(
      'Falta TELEGRAM_TOKEN_ENCRYPTION_KEY: sin esa clave no se pueden descifrar los tokens guardados.',
    );
  }
  const decoded = Buffer.from(raw, 'base64');
  return decoded.length === 32
    ? decoded
    : createHash('sha256').update(raw).digest();
}

/** Mismo formato que escribia `TelegramCryptoService`: iv:tag:datos en base64. */
function descifrarToken(payload: string, key: Buffer): string {
  const partes = payload.split(':');
  if (partes.length !== 3) {
    throw new Error('El token almacenado no tiene el formato esperado.');
  }
  const [ivB64, tagB64, dataB64] = partes;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('El token almacenado no tiene el formato esperado.');
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

async function llamarTelegram(
  token: string,
  metodo: string,
  cuerpo: Record<string, unknown>,
): Promise<{ ok: boolean; descripcion?: string; reintentarEn?: number }> {
  const respuesta = await fetch(
    `https://api.telegram.org/bot${token}/${metodo}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(cuerpo),
    },
  );
  const datos = (await respuesta.json()) as {
    ok: boolean;
    description?: string;
    result?: { username?: string };
    parameters?: { retry_after?: number };
  };
  if (datos.ok) return { ok: true };
  return {
    ok: false,
    descripcion: datos.description,
    reintentarEn: datos.parameters?.retry_after,
  };
}

async function usuarioDelBotCentral(token: string): Promise<string> {
  const respuesta = await fetch(`https://api.telegram.org/bot${token}/getMe`);
  const datos = (await respuesta.json()) as {
    ok: boolean;
    result?: { username?: string };
    description?: string;
  };
  if (!datos.ok || !datos.result?.username) {
    throw new Error(
      `No se pudo identificar el bot central: ${datos.description ?? 'respuesta inesperada'}`,
    );
  }
  return datos.result.username;
}

/**
 * Clientes a los que hay que avisar por el bot de esta modelo.
 *
 * Se cruzan dos fuentes porque ninguna basta por si sola: las sesiones de
 * Telegram cubren a quien esta hablando ahora mismo --su clave lleva delante el
 * id de la empleada justo en los bots dedicados-- pero caducan; los servicios
 * cubren a quien ya contrato aunque su sesion se haya ido.
 */
async function chatsPorAvisar(employeeId: string): Promise<string[]> {
  const sesiones: Array<{ key: string }> = await AppDataSource.query(
    `SELECT key FROM telegram_sessions WHERE key LIKE $1`,
    [`${employeeId}:%`],
  );
  const servicios: Array<{ cliente_telegram_id: string }> =
    await AppDataSource.query(
      `SELECT DISTINCT cliente_telegram_id
         FROM servicios
        WHERE empleada_id = $1 AND cliente_telegram_id IS NOT NULL`,
      [employeeId],
    );

  const chats = new Set<string>();
  for (const sesion of sesiones) {
    // `empleadaId:fromId:chatId`; en un chat privado el chat es el propio cliente.
    const partes = sesion.key.split(':');
    if (partes.length === 3 && partes[2]) chats.add(partes[2]);
  }
  for (const servicio of servicios) {
    if (servicio.cliente_telegram_id) chats.add(servicio.cliente_telegram_id);
  }
  return [...chats];
}

/** Los ids del personal no reciben el aviso: no son clientes de la modelo. */
async function chatsDelEquipo(): Promise<Set<string>> {
  const filas: Array<{ telegram_chat_id: string }> = await AppDataSource.query(
    `SELECT telegram_chat_id FROM usuarios WHERE telegram_chat_id IS NOT NULL`,
  );
  return new Set(filas.map((fila) => fila.telegram_chat_id));
}

async function main(): Promise<void> {
  const enviar = process.argv.includes('--enviar');
  const tokenCentral = process.env.TELEGRAM_BOT_TOKEN;
  if (!tokenCentral) {
    throw new Error('Falta TELEGRAM_BOT_TOKEN en el entorno.');
  }

  await AppDataSource.initialize();
  try {
    const usuarioCentral = await usuarioDelBotCentral(tokenCentral);
    const key = claveDeCifrado();
    const equipo = await chatsDelEquipo();

    const bots: FilaBot[] = await AppDataSource.query(
      `SELECT b.id, b.employee_id, b.token_ciphertext, e.nombre_artistico
         FROM employee_telegram_bots b
         LEFT JOIN empleadas e ON e.id = b.employee_id`,
    );

    if (!bots.length) {
      console.log('No hay bots dedicados registrados: no hay a quien avisar.');
      return;
    }

    console.log(
      `${bots.length} bot(s) dedicados. Bot central: @${usuarioCentral}. ` +
        `Modo: ${enviar ? 'ENVIO REAL' : 'ensayo (no se envia nada)'}.`,
    );

    let avisados = 0;
    let fallidos = 0;

    for (const bot of bots) {
      const nombre = bot.nombre_artistico ?? 'la modelo';
      let token: string;
      try {
        token = descifrarToken(bot.token_ciphertext, key);
      } catch (error) {
        console.error(
          `  [${nombre}] no se pudo descifrar su token, se omite: ${String(error)}`,
        );
        continue;
      }

      const chats = (await chatsPorAvisar(bot.employee_id)).filter(
        (chat) => !equipo.has(chat),
      );
      console.log(`  [${nombre}] ${chats.length} chat(s) por avisar.`);
      if (!enviar) continue;

      const texto =
        `Mi amor, a partir de ahora te escribo desde otra cuenta de Telegram. ` +
        `Toca el boton de aqui abajo para seguir conmigo alli y no perder nuestra conversacion.`;
      const teclado = {
        inline_keyboard: [
          [
            {
              text: `Seguir hablando con ${nombre}`,
              url: `https://t.me/${usuarioCentral}?start=contratar_${bot.employee_id}`,
            },
          ],
        ],
      };

      for (const chat of chats) {
        let resultado = await llamarTelegram(token, 'sendMessage', {
          chat_id: chat,
          text: texto,
          reply_markup: teclado,
        });
        if (!resultado.ok && resultado.reintentarEn) {
          await new Promise((resolve) =>
            setTimeout(resolve, (resultado.reintentarEn! + 1) * 1000),
          );
          resultado = await llamarTelegram(token, 'sendMessage', {
            chat_id: chat,
            text: texto,
            reply_markup: teclado,
          });
        }
        if (resultado.ok) {
          avisados += 1;
        } else {
          fallidos += 1;
          // Lo normal aqui es "bot was blocked by the user" o "chat not found":
          // clientes que borraron el chat. No es un fallo que haya que remontar.
          console.warn(`    chat ${chat}: ${resultado.descripcion ?? 'error'}`);
        }
        await new Promise((resolve) =>
          setTimeout(resolve, PAUSA_ENTRE_ENVIOS_MS),
        );
      }
    }

    if (enviar) {
      console.log(
        `Avisos entregados: ${avisados}. No entregados: ${fallidos}.`,
      );
      console.log(
        'Ya se puede aplicar la migracion que borra la tabla employee_telegram_bots.',
      );
    } else {
      console.log(
        'Ensayo terminado. Repite con --enviar para mandar los avisos.',
      );
    }
  } finally {
    await AppDataSource.destroy();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
