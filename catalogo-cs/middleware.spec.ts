import { NextRequest } from "next/server";
import { BACKEND_API_PREFIX } from "@/lib/api-constants";

/**
 * El middleware es la costura entre el navegador y NestJS, y es donde se
 * concentraron tres fallos seguidos que ni la compilacion ni los tipos veian:
 *
 *  - el prefijo de version se armaba como `/api/1` en vez de `/api/v1`, y el
 *    backend respondia 404;
 *  - `/api/geocode`, que es una ruta propia de Next, no estaba entre las
 *    exclusiones, asi que la busqueda de direcciones se reescribia al backend
 *    y fallaba en silencio;
 *  - la cabecera `Cookie` se reenviaba cruda, con la capa de codificacion que
 *    Next le anade encima de la firma de Express, y el backend respondia 401
 *    con una sesion recien abierta.
 *
 * Los tres son de enrutado puro --entra una peticion, sale una respuesta-- asi
 * que se pueden fijar aqui sin navegador ni servidor.
 */

const BACKEND = "http://backend-de-prueba:4000";

/*
 * El modulo se carga tras fijar la variable de entorno porque `backendUrl()` la
 * lee en cada llamada, pero el import se evalua una sola vez por fichero.
 */
process.env.BACKEND_API_URL = BACKEND;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { middleware } = require("./middleware") as {
  middleware: (peticion: NextRequest) => Promise<Response> | Response;
};

/** Una peticion del navegador, con las cookies que se quieran. */
function peticion(ruta: string, cookies: Record<string, string> = {}) {
  const cabeceras = new Headers();
  const armadas = Object.entries(cookies)
    .map(([nombre, valor]) => `${nombre}=${valor}`)
    .join("; ");
  if (armadas) cabeceras.set("cookie", armadas);
  return new NextRequest(new URL(ruta, "https://colombia-sexys.test"), {
    headers: cabeceras,
  });
}

/** A donde reescribio el middleware, o null si no reescribio. */
function destinoReescrito(respuesta: Response): string | null {
  return respuesta.headers.get("x-middleware-rewrite");
}

describe("middleware: reescritura de /api hacia el backend", () => {
  it("traduce la ruta con el prefijo de version completo", async () => {
    const respuesta = await middleware(peticion("/api/services/pendientes"));

    expect(destinoReescrito(respuesta)).toBe(
      `${BACKEND}${BACKEND_API_PREFIX}/services/pendientes`,
    );
  });

  it("conserva la cadena de consulta", async () => {
    const respuesta = await middleware(peticion("/api/services?estado=en_curso"));

    expect(destinoReescrito(respuesta)).toBe(
      `${BACKEND}${BACKEND_API_PREFIX}/services?estado=en_curso`,
    );
  });

  /*
   * El prefijo se afirma contra su valor literal ademas de contra la constante:
   * si alguien reintroduce el `/api/1` sin la `v`, cambiar la constante haria
   * pasar la prueba anterior sin arreglar nada.
   */
  it("el prefijo es /api/v1, no /api/1", () => {
    expect(BACKEND_API_PREFIX).toBe("/api/v1");
  });

  it.each([
    "/api/assistant/mensaje",
    "/api/auth/login",
    "/api/geocode?q=polanco",
    "/api/health",
    "/api/realtime",
    "/api/version",
  ])("no reescribe %s, que es una ruta propia de Next", async (ruta) => {
    const respuesta = await middleware(peticion(ruta));

    expect(destinoReescrito(respuesta)).toBeNull();
  });

  /*
   * Las cookies de sesion van firmadas por Express como `s%3A<valor>.<firma>`, y
   * Next les anade su propia capa al guardarlas. Reenviar la cabecera cruda le
   * entrega al backend el texto con la capa de mas: `signedCookies` llega vacio
   * y el guard responde 401 aunque la sesion acabe de empezar.
   */
  it("rearma la cookie en vez de reenviar la cruda del navegador", async () => {
    const firmada = "s%3Avalor.firma";
    const respuesta = await middleware(
      peticion("/api/services", { access_token: firmada }),
    );

    // La cookie que el middleware pone para el backend, ya rearmada.
    const enviada = respuesta.headers.get("x-middleware-request-cookie");

    // Decodificada una vez: `s:valor.firma`, que es lo que `cookie-parser`
    // sabe verificar. Con la cabecera cruda llegaria `s%3Avalor.firma`.
    expect(enviada).toBe("access_token=s:valor.firma");
  });
});
