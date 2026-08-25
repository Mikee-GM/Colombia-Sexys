/**
 * Clave con la que se guarda la sesion de un chat.
 *
 * Tiene que construirse en un solo sitio. El middleware de sesion la calcula
 * al leer y cualquier escritura posterior debe usar exactamente la misma: en
 * los bots dedicados de cada modelo la clave lleva delante el id de la
 * empleada, y escribir sin ese prefijo crea una fila paralela que nadie vuelve
 * a leer, de modo que todo lo que la conversacion habia averiguado —las horas,
 * el metodo de pago, la ubicacion— se pierde en silencio.
 */
export type SessionKeyContext = {
  from?: { id: number | string };
  chat?: { id: number | string };
  dedicatedBotEmployeeId?: string;
};

export function buildSessionKey(ctx: SessionKeyContext): string | undefined {
  if (!ctx.from || !ctx.chat) return undefined;
  const base = `${ctx.from.id}:${ctx.chat.id}`;
  return ctx.dedicatedBotEmployeeId
    ? `${ctx.dedicatedBotEmployeeId}:${base}`
    : base;
}

/** Las piezas de una clave de sesion, ya separadas. */
export interface ParsedSessionKey {
  /** Solo en los bots dedicados: la empleada dueña del bot. */
  employeeId?: string;
  /** Telegram id de quien escribio, que en un chat privado es tambien el chat. */
  fromId: string;
  chatId: string;
}

/**
 * Deshace `buildSessionKey`.
 *
 * Hace falta porque el puente jefe -> cliente localiza la sesion por su fila y
 * tiene que sacar de la clave a quien responderle. Cuando la clave gano el
 * prefijo del bot dedicado, el codigo que leia `key.split(':')[0]` empezo a
 * quedarse con el id de la EMPLEADA en vez de con el del cliente, asi que el
 * mensaje del jefe se enviaba a un destinatario inexistente y no llegaba nunca.
 */
export function parseSessionKey(key: string): ParsedSessionKey | null {
  const parts = key.split(':');
  if (parts.length === 2) return { fromId: parts[0], chatId: parts[1] };
  if (parts.length === 3) {
    return { employeeId: parts[0], fromId: parts[1], chatId: parts[2] };
  }
  return null;
}
