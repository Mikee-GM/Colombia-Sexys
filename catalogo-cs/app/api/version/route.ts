import { readFileSync } from "node:fs";
import { join } from "node:path";

export const dynamic = "force-dynamic";

/**
 * Identificador de esta compilacion.
 *
 * Sirve para que una aplicacion ya instalada se entere de que hay una version
 * nueva. `router.refresh()` recarga los datos, pero el JavaScript sigue siendo
 * el que se descargo la primera vez: si el despliegue cambio una pantalla, se
 * sigue viendo la anterior. Y en un telefono la aplicacion no se recarga al
 * volver a ella, se reanuda, asi que puede pasar dias sin una carga completa.
 *
 * Se lee `BUILD_ID`, que Next escribe por compilacion, y no la hora de
 * arranque: con varias replicas cada una tendria una hora distinta y el cliente
 * se recargaria en bucle al ir cayendo en una u otra. El identificador es el
 * mismo en todas las replicas de la misma imagen.
 *
 * Se resuelve una sola vez y se guarda: es un archivo que no cambia mientras el
 * proceso vive.
 */
function leerBuildId(): string {
  const candidatos = [
    join(process.cwd(), ".next", "BUILD_ID"),
    join(process.cwd(), "catalogo-cs", ".next", "BUILD_ID"),
  ];

  for (const ruta of candidatos) {
    try {
      const valor = readFileSync(ruta, "utf8").trim();
      if (valor) return valor;
    } catch {
      // Se prueba el siguiente candidato.
    }
  }

  /*
   * Sin BUILD_ID --en desarrollo, o si cambia la disposicion de archivos-- se
   * devuelve un valor fijo del proceso. Vale para desarrollo y, en el peor
   * caso, solo significa que no se detectan versiones nuevas: nunca provoca
   * una recarga que no toca.
   */
  return "sin-build-id";
}

const VERSION = leerBuildId();

export function GET() {
  return Response.json({ version: VERSION });
}
