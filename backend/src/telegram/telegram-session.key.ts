/**
 * Clave con la que se guarda la sesion de un chat.
 *
 * Tiene que construirse en un solo sitio. El middleware de sesion la calcula
 * al leer y cualquier escritura posterior debe usar exactamente la misma:
 * escribir con otra forma crea una fila paralela que nadie vuelve a leer, de
 * modo que todo lo que la conversacion habia averiguado —las horas, el metodo
 * de pago, la ubicacion— se pierde en silencio.
 */
export type SessionKeyContext = {
  from?: { id: number | string };
  chat?: { id: number | string };
};

export function buildSessionKey(ctx: SessionKeyContext): string | undefined {
  if (!ctx.from || !ctx.chat) return undefined;
  return `${ctx.from.id}:${ctx.chat.id}`;
}

/** Las piezas de una clave de sesion, ya separadas. */
export interface ParsedSessionKey {
  /**
   * Solo en las filas heredadas de los bots dedicados: la empleada dueña del
   * bot por el que entro la conversacion.
   */
  employeeId?: string;
  /** Telegram id de quien escribio, que en un chat privado es tambien el chat. */
  fromId: string;
  chatId: string;
}

/**
 * Deshace `buildSessionKey`.
 *
 * Hace falta porque el puente jefe -> cliente localiza la sesion por su fila
 * --buscando dentro del JSON, no por la clave-- y tiene que sacar de la clave a
 * quien responderle. Nunca se debe leer `key.split(':')[0]` a mano: mientras
 * queden filas de la epoca de los bots dedicados eso devuelve el id de la
 * EMPLEADA, y el mensaje sale hacia un destinatario que no existe.
 *
 * La forma de tres partes se sigue entendiendo a proposito: las sesiones viven
 * 30 dias, asi que hay conversaciones vivas guardadas con el formato viejo.
 */
export function parseSessionKey(key: string): ParsedSessionKey | null {
  const parts = key.split(':');
  if (parts.length === 2) return { fromId: parts[0], chatId: parts[1] };
  if (parts.length === 3) {
    return { employeeId: parts[0], fromId: parts[1], chatId: parts[2] };
  }
  return null;
}
