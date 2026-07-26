export type TelegramStartPayload =
  | { type: 'group_service' }
  | { type: 'employee_hire'; employeeId: string }
  | { type: 'unknown' };

export function parseTelegramStartPayload(text?: string): TelegramStartPayload {
  const payload = text?.trim().split(/\s+/, 2)[1];
  if (!payload) return { type: 'unknown' };
  if (payload === 'servicio_grupal') return { type: 'group_service' };
  if (!payload.startsWith('contratar_')) return { type: 'unknown' };

  const employeeId = payload
    .slice('contratar_'.length)
    .replace(/^empleada_/, '');
  return employeeId
    ? { type: 'employee_hire', employeeId }
    : { type: 'unknown' };
}
