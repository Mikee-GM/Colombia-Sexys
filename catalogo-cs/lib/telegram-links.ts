const DEFAULT_TELEGRAM_BOT_USERNAME = "ChambaPastelesBot";

export function getTelegramBotUsername() {
  return (
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ||
    DEFAULT_TELEGRAM_BOT_USERNAME
  ).replace(/^@/, "");
}

/** Enlace que abre el bot ya en la conversacion de contratacion de la modelo. */
export function getEmployeeHireTelegramUrl(employeeId: string) {
  return `https://t.me/${getTelegramBotUsername()}?start=contratar_${employeeId}`;
}

export function getGroupServiceTelegramUrl() {
  return `https://t.me/${getTelegramBotUsername()}?start=servicio_grupal`;
}

export function getCandidateScreeningTelegramUrl(token: string) {
  return `https://t.me/${getTelegramBotUsername()}?start=candidata_${token}`;
}
