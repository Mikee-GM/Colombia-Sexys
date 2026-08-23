import { Logger } from '@nestjs/common';

type Ctx = unknown;
type Next = () => Promise<void>;

const logger = new Logger('TelegramSessionLock');

/**
 * Cuanto puede esperar un update a que termine el anterior del mismo cliente.
 *
 * Un manejador colgado no debe dejar mudo al cliente para siempre: pasado este
 * plazo el siguiente update entra igualmente, aceptando el riesgo de solape que
 * la columna `version` del almacen de sesiones sigue cubriendo.
 */
const MAX_WAIT_MS = 45_000;

/**
 * Middleware que procesa en fila los updates de una misma sesion.
 *
 * Telegram entrega los updates en paralelo —con webhook cada mensaje es una
 * peticion HTTP independiente—, asi que dos mensajes seguidos del mismo cliente
 * pueden estar dentro del bot a la vez. Como la sesion se lee al empezar y se
 * escribe al terminar, el segundo en acabar borraba lo que guardo el primero.
 *
 * Encolar por clave de sesion elimina el solape en la raiz: el segundo mensaje
 * espera y arranca leyendo el estado que dejo el primero. Solo se serializa
 * dentro de este proceso; entre varios, el conflicto lo detecta la version de
 * la fila.
 *
 * Debe registrarse *antes* que el middleware de sesion, para que el cerrojo
 * envuelva tambien la lectura y la escritura.
 */
export function serializeBySessionKey(
  getSessionKey: (ctx: Ctx) => string | undefined,
) {
  const pending = new Map<string, Promise<void>>();

  return async (ctx: Ctx, next: Next): Promise<void> => {
    const key = getSessionKey(ctx);
    if (!key) return next();

    const previous = pending.get(key);
    let release!: () => void;
    const mine = new Promise<void>((resolve) => {
      release = resolve;
    });
    pending.set(key, mine);

    if (previous) {
      // `race` con el plazo maximo: si el update anterior se queda colgado, el
      // cliente no se queda sin respuesta indefinidamente.
      const timedOut = await Promise.race([
        previous.then(() => false),
        delay(MAX_WAIT_MS).then(() => true),
      ]);
      if (timedOut) {
        logger.warn(
          `Sesion ${key}: el update anterior no termino en ${MAX_WAIT_MS} ms, se continua sin esperarlo.`,
        );
      }
    }

    try {
      await next();
    } finally {
      release();
      // Solo se limpia si nadie se puso detras mientras tanto, para no dejar
      // entradas muertas ni borrar el turno de otro.
      if (pending.get(key) === mine) pending.delete(key);
    }
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    // El temporizador no debe impedir que el proceso termine.
    timer.unref?.();
  });
}
