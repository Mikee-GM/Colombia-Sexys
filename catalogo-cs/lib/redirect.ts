import { NextResponse, type NextRequest } from "next/server";

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
 * Redirect interno desde el middleware.
 *
 * El middleware NO admite un `Location` relativo: Next valida la respuesta y
 * hace `new URL(location)` sobre ella, que lanza `ERR_INVALID_URL` con una
 * ruta suelta. Sintoma en produccion: `TypeError: Invalid URL { input:
 * '/admin' }` y el panel entero sin poder entrar. En un route handler si
 * funciona relativo, y por eso `redirectToPath` se queda como esta.
 *
 * La URL absoluta se arma sobre el host por el que llego la peticion, dando
 * prioridad a las cabeceras del proxy inverso. Asi se evita tambien el
 * problema que motivo el redirect relativo: dentro del contenedor el servidor
 * escucha en `0.0.0.0`, y armar el destino con esa direccion produce enlaces a
 * los que el navegador no puede ir.
 */
export function redirectFromRequest(
  request: NextRequest,
  path: string,
  status: 307 | 308 = 307,
) {
  const destino = request.nextUrl.clone();
  const [pathname, search] = safeInternalPath(path).split("?");
  destino.pathname = pathname;
  destino.search = search ? `?${search}` : "";

  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (host) {
    destino.host = host;
    /*
     * Y hay que borrar el puerto a mano.
     *
     * El setter `host` de URL solo toca el puerto si el valor que se le da
     * trae uno. Detras de un proxy inverso la cabecera llega sin puerto
     * --`rvcs-pruebas.com.mx`-- mientras que la URL clonada tiene el puerto
     * interno en el que escucha Next dentro del contenedor, asi que el destino
     * quedaba en `https://rvcs-pruebas.com.mx:3000/admin`: un puerto que no
     * esta publicado y al que el navegador no puede llegar. El sintoma era una
     * URL con `:3000` aparecida de la nada y una pagina que no carga.
     *
     * Se mira si el host trae puerto propio en vez de buscar un `:` a secas,
     * que en IPv6 (`[::1]`) esta siempre.
     */
    if (!/:\d+$/.test(host)) destino.port = "";
    const proto = request.headers.get("x-forwarded-proto");
    if (proto) destino.protocol = `${proto}:`;
  }

  return NextResponse.redirect(destino, status);
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
