const DEFAULT_TELEGRAM_BOT_USERNAME = "ChambaPastelesBot";

export function getTelegramBotUsername() {
  return (
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ||
    DEFAULT_TELEGRAM_BOT_USERNAME
  ).replace(/^@/, "");
}

/**
 * Cada modelo tiene su propio bot. Mientras no se le haya cargado el token,
 * `botUsername` viene vacio y el enlace cae al bot central, que sigue
 * atendiendo con normalidad.
 */
export function getEmployeeHireTelegramUrl(
  employeeId: string,
  botUsername?: string | null,
) {
  const bot = (botUsername || "").replace(/^@/, "") || getTelegramBotUsername();
  return `https://t.me/${bot}?start=contratar_${employeeId}`;
}

export function getGroupServiceTelegramUrl() {
  return `https://t.me/${getTelegramBotUsername()}?start=servicio_grupal`;
}

export function getCandidateScreeningTelegramUrl(token: string) {
  return `https://t.me/${getTelegramBotUsername()}?start=candidata_${token}`;
}
