import { NextResponse } from "next/server";

/**
 * Redirect a una ruta de la propia aplicacion.
 *
 * El `Location` va relativo a proposito. Para armarlo absoluto hay que saber
 * por que host llego el navegador, y el servidor no siempre lo sabe: detras de
 * un proxy inverso, o con el server escuchando en `0.0.0.0` como en el
 * contenedor, `request.url` trae la direccion de escucha interna en vez de la
 * publica. De ahi salian redirects a `http://0.0.0.0:3000/...`, que es una
 * direccion a la que el navegador no puede ir: 0.0.0.0 significa "todas las
 * interfaces locales" para quien escucha, no un destino para quien navega.
 *
 * Relativo no hace falta adivinar nada: el navegador lo resuelve contra la URL
 * que el mismo pidio, que por definicion es la publica y correcta. Funciona
 * igual detras de proxy, por IP, por dominio o en local.
 *
 * Se arma a mano porque `NextResponse.redirect()` exige una URL absoluta y
 * lanza si recibe una ruta.
 */
export function redirectToPath(path: string, status: 307 | 308 = 307) {
  return new NextResponse(null, {
    status,
    headers: { Location: safeInternalPath(path) },
  });
}

/**
 * Solo rutas internas.
 *
 * Una ruta que empieza por `//` no es interna: el navegador la lee como
 * `//host` y termina en otro sitio. Con la sesion recien abierta eso seria un
 * salto regalado a un dominio ajeno, asi que cualquier cosa que no sea una
 * ruta absoluta de esta aplicacion cae a la raiz.
 */
function safeInternalPath(path: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  return path;
}
