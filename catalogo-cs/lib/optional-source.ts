import { isRedirectError } from "@/lib/auth";

/**
 * Degrada una fuente de datos a un valor por defecto sin tragarse las
 * redirecciones de Next.
 *
 * Las pantallas del panel se arman con varias fuentes en paralelo y conviene
 * que la caida de una no tumbe el resto. El `catch` a secas no sirve para eso:
 * `apiFetch` corta la sesion invocando `redirect`, y `notFound` viaja igual,
 * como una excepcion. Atraparlas junto a un fallo de red deja la pantalla
 * dibujada y vacia -- cero en todos los indicadores, "no hay datos" en todas
 * las tablas -- en lugar de mandar al login.
 *
 * Este helper reemite esas dos y solo degrada los errores de verdad, dejando
 * rastro en el log para que la fuente caida no pase inadvertida.
 *
 * @param context Nombre de la pantalla, para identificar la fuente en el log.
 */
export async function optionalSource<T>(
  promise: Promise<T>,
  fallback: T,
  context: string,
): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error(`Fuente no disponible en ${context}:`, error);
    return fallback;
  }
}
