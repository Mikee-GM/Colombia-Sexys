/**
 * Extrae un mensaje legible de un valor capturado en un `catch`.
 *
 * Con `useUnknownInCatchVariables` activo (parte de `strict`) la variable del
 * `catch` es `unknown`, asi que `err.message` ya no compila. Este helper
 * concentra la comprobacion en un sitio en vez de repetir el ternario en cada
 * bloque, y ademas evita el `undefined` que salia cuando lo lanzado no era un
 * `Error` (una cadena, un objeto de la API de Telegram, etc).
 */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}
