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
