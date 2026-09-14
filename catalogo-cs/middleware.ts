import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  REFRESH_COOKIE,
} from "@/lib/auth-constants";
import { BACKEND_API_PREFIX } from "@/lib/api-constants";
import {
  buildCookieHeader,
  parseSetCookieHeaders,
  type ParsedCookie,
} from "@/lib/set-cookie";
import { redirectFromRequest } from "@/lib/redirect";
import { inicioParaRol, puedeEntrarEn } from "@/lib/roles";

function backendUrl() {
  return process.env.BACKEND_API_URL || "http://localhost:4000";
}

/**
 * Renueva la sesion con el refresh token, si es que hay uno.
 *
 * Va en el middleware y no en `apiFetch` porque un Server Component no puede
 * escribir cookies: cuando el render descubre que el access token caduco ya es
 * tarde para renovarlo, y lo unico que le queda es mandar al login. El
 * middleware corre antes del render y si puede escribirlas.
 *
 * Devuelve las cookies nuevas, o `null` si no hay con que renovar o el backend
 * la rechaza -- refresh caducado, sesion cerrada desde otro dispositivo.
 */
async function renovarSesion(
  request: NextRequest,
): Promise<ParsedCookie[] | null> {
  if (!request.cookies.has(REFRESH_COOKIE)) return null;

  const destino = new URL(
    `${BACKEND_API_PREFIX}/auth/refresh`,
    backendUrl(),
  );

  try {
    const response = await fetch(destino, {
      method: "POST",
      cache: "no-store",
      headers: {
        // Armada, no cruda: reenviarla tal cual llega con una capa de
        // codificacion de mas y Express no reconoce la firma del refresh.
        Cookie: buildCookieHeader(request),
        // El backend compara esta cabecera con la cookie homonima. La cookie no
        // es httpOnly justamente para poder repetirla aqui.
        "x-csrf-token": request.cookies.get(CSRF_COOKIE)?.value ?? "",
      },
    });
    if (!response.ok) return null;

    const cookies = parseSetCookieHeaders(response);
    return cookies.length > 0 ? cookies : null;
  } catch {
    // Backend caido o inalcanzable. Se trata como sesion no renovable: mejor
    // mandar al login que servir una pagina que va a reventar al pedir datos.
    return null;
  }
}

/**
 * Renueva la sesion si al navegador ya se le caduco el acceso.
 *
 * El access token dura doce horas y el navegador borra su cookie al vencer; el
 * refresco vive un año. Este es el punto donde una cosa se convierte en la
 * otra, y por eso tiene que correr en TODAS las rutas que la sesion sostiene,
 * no solo en las paginas del panel: los portales de modelo y chofer no
 * renovaban nunca --su rama devolvia antes de llegar aqui-- asi que su sesion
 * moria a la hora, y el proxy de `/api` tampoco, de modo que el canal de avisos
 * se quedaba reconectando contra un 401 para siempre. Son justo las dos
 * pantallas que tienen que seguir vivas para que lleguen las notificaciones.
 *
 * Devuelve las cookies nuevas, o `null` si no hizo falta renovar o no se pudo.
 * Cuando renueva, las deja tambien sobre la peticion, para que lo que venga
 * detras --el render, el proxy-- ya vea la sesion buena sin otro viaje.
 */
async function renovarSiHaceFalta(
  request: NextRequest,
): Promise<ParsedCookie[] | null> {
  if (request.cookies.has(ACCESS_COOKIE)) return null;

  const renovadas = await renovarSesion(request);
  if (!renovadas) return null;

  for (const { name, value } of renovadas) {
    request.cookies.set(name, value);
  }
  return renovadas;
}

/** Copia sobre la respuesta las cookies que devolvio la renovacion. */
function conCookies(
  respuesta: NextResponse,
  renovadas: ParsedCookie[] | null,
): NextResponse {
  for (const { name, value, options } of renovadas ?? []) {
    respuesta.cookies.set(name, value, options);
  }
  return respuesta;
}

/**
 * Rol de la sesion, segun el backend.
 *
 * Se pregunta a `/auth/me` en vez de leer el JWT aqui: el backend verifica la
 * firma y comprueba que la sesion siga viva, mientras que descodificar el token
 * en el middleware daria por bueno cualquier payload que alguien pusiera en la
 * cookie. Una decision de autorizacion no puede apoyarse en un dato sin
 * verificar.
 */
type Sesion =
  | { estado: "ok"; rol: string }
  | { estado: "sin-sesion" }
  /** El backend no contesto. No dice nada sobre si la sesion es buena. */
  | { estado: "incomunicado" };

async function rolDeLaSesion(cookieHeader: string): Promise<Sesion> {
  if (!cookieHeader) return { estado: "sin-sesion" };
  const destino = new URL(`${BACKEND_API_PREFIX}/auth/me`, backendUrl());
  try {
    const response = await fetch(destino, {
      cache: "no-store",
      headers: { Cookie: cookieHeader },
    });
    if (!response.ok) return { estado: "sin-sesion" };
    const data = (await response.json()) as { rol?: unknown };
    return typeof data?.rol === "string"
      ? { estado: "ok", rol: data.rol }
      : { estado: "sin-sesion" };
  } catch {
    /*
     * Backend caido, reiniciandose o con la red a medias.
     *
     * Antes esto se trataba igual que no tener sesion y mandaba al login: un
     * bache de unos segundos echaba del panel a todo el mundo, y volver a
     * entrar exige la contraseña. No dice nada sobre si la sesion es valida,
     * asi que no puede ser motivo para cerrarla.
     */
    return { estado: "incomunicado" };
  }
}

/**
 * Cambia el token con el que se abre un portal por una sesion en cookie.
 *
 * Los portales de empleada y chofer se abren desde una Mini App de Telegram,
 * que trae el token en la URL. Una aplicacion instalada arranca desde su icono,
 * sin token, asi que sin esto no se podia abrir dos veces; y los avisos push
 * tampoco funcionan dentro del webview de Telegram, solo en la app instalada.
 *
 * Devuelve las cookies nuevas, o `null` si el canje falla. En ese caso no se
 * toca nada y la pagina sigue resolviendo el token por su cuenta, como hasta
 * ahora: un enlace viejo tiene que seguir abriendo el portal.
 */
async function canjearTokenDePortal(
  request: NextRequest,
  token: string,
): Promise<ParsedCookie[] | null> {
  const destino = new URL(`${BACKEND_API_PREFIX}/auth/portal-session`, backendUrl());

  try {
    const response = await fetch(destino, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        // Identifica el dispositivo en la sesion, igual que en el login.
        "user-agent": request.headers.get("user-agent") ?? "portal",
      },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) return null;

    const cookies = parseSetCookieHeaders(response);
    return cookies.length > 0 ? cookies : null;
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  /*
   * 0. Canje del token de portal.
   *
   * Solo la primera vez: si ya hay cookie de acceso, la sesion esta abierta y
   * el token de la URL sobra. Al canjear se redirige a la misma ruta sin el
   * token, porque una URL con credencial acaba en el historial del telefono,
   * en los registros del proxy y en la cabecera Referer de cualquier recurso.
   */
  /*
   * La pantalla del servicio en curso entra aqui tambien: es a donde apuntan
   * los avisos que se mandan durante un servicio, y sin el canje un enlace con
   * token aterrizaria sin sesion.
   */
  if (
    pathname === "/empleada/portal" ||
    pathname === "/chofer/portal" ||
    pathname === "/empleada/servicio" ||
    pathname === "/chofer/servicio"
  ) {
    const tokenDePortal = request.nextUrl.searchParams.get("token");
    if (tokenDePortal && !request.cookies.has(ACCESS_COOKIE)) {
      const canjeadas = await canjearTokenDePortal(request, tokenDePortal);
      if (canjeadas) {
        const limpia = new URL(request.nextUrl);
        limpia.searchParams.delete("token");
        const respuesta = NextResponse.redirect(limpia);
        for (const { name, value, options } of canjeadas) {
          respuesta.cookies.set(name, value, options);
        }
        return respuesta;
      }
    }
    /*
     * Y si no habia token que canjear, se renueva como en cualquier otra ruta.
     *
     * Esta rama devolvia aqui mismo, asi que la sesion de los portales no se
     * renovaba nunca: a la hora, cuando el navegador borraba la cookie de
     * acceso, la modelo o el chofer se encontraban con el login del panel.
     */
    return conCookies(
      NextResponse.next({ request: { headers: request.headers } }),
      await renovarSiHaceFalta(request),
    );
  }

  // 1. Proxy /api/* requests to NestJS backend (excluding Next.js internal API routes)
  if (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/assistant") &&
    !pathname.startsWith("/api/auth") &&
    !pathname.startsWith("/api/geocode") &&
    !pathname.startsWith("/api/health") &&
    !pathname.startsWith("/api/realtime") &&
    !pathname.startsWith("/api/version")
  ) {
    /*
     * El backend publica toda su superficie bajo `/api/v1`. Aqui se traduce
     * `/api/algo` del navegador a `/api/v1/algo` del backend.
     *
     * Se usa el prefijo ya construido y no `/api/${BACKEND_API_VERSION}`, que
     * daba `/api/1` sin la `v` y hacia que el backend respondiera 404. No se
     * noto antes porque ninguna llamada del navegador pasaba por aqui: las
     * paginas piden sus datos en el servidor con `apiFetch`, que arma el
     * prefijo bien, y las rutas propias de Next quedan excluidas arriba.
     */
    /*
     * Renovar antes de reenviar.
     *
     * Es el unico camino por el que el navegador llega al backend sin pasar por
     * un render, asi que si aqui no se renueva, una peticion hecha justo
     * despues de caducar el acceso se va con la cookie vacia y vuelve 401.
     */
    const renovadasApi = await renovarSiHaceFalta(request);

    const apiPath = pathname.replace(/^\/api/, BACKEND_API_PREFIX);
    const targetUrl = new URL(`${apiPath}${search}`, backendUrl());
    /*
     * La cookie se rearma antes de reenviarla, igual que hacen la renovacion y
     * la consulta de rol de mas abajo.
     *
     * Las cookies de sesion van firmadas por Express, que las escribe como
     * `s%3A<valor>.<firma>`, y Next les añade su propia capa de codificacion al
     * guardarlas. Reenviar la cabecera cruda del navegador le entrega al
     * backend ese texto con la capa de mas: `cookie-parser` no reconoce la
     * firma, `signedCookies` llega vacio y el guard responde 401 aunque la
     * sesion acabe de empezar. `buildCookieHeader` la reconstruye desde las
     * cookies ya decodificadas por Next, que es lo que Express espera.
     */
    const cabeceras = new Headers(request.headers);
    cabeceras.set("cookie", buildCookieHeader(request));
    return conCookies(
      NextResponse.rewrite(targetUrl, { request: { headers: cabeceras } }),
      renovadasApi,
    );
  }

  // 2. Auth checks for /admin and /jefe routes
  const isAdminRoute = pathname.startsWith("/admin");
  const isJefeRoute = pathname.startsWith("/jefe");

  if (isAdminRoute || isJefeRoute) {
    /*
     * A) La ruta exacta de login.
     *
     * Antes se servia siempre, sin mirar la sesion: quien entraba con una
     * cookie de acceso perfectamente valida (por ejemplo, el boton "atras" del
     * navegador, o un enlace guardado a "/admin") veia el formulario de login
     * en vez de terminar en su panel. El unico redirect que lo sacaba de ahi
     * vivia del lado del cliente (LoginForm intentando refrescar la sesion), y
     * dependia de que ese JavaScript llegara a correr.
     *
     * Se resuelve la sesion aqui mismo, con el mismo mecanismo de renovacion
     * que usan las rutas protegidas, y si hay un rol valido se manda derecho a
     * su panel. Si no hay sesion, sigue sirviendose el login como siempre.
     */
    if (pathname === "/admin") {
      const renovadas = await renovarSiHaceFalta(request);

      const sesion = await rolDeLaSesion(buildCookieHeader(request));
      // Sin rol confirmado se sirve el login, como siempre: aqui no hay nada
      // que cerrar, solo se decide si hace falta enseñarlo.
      if (sesion.estado !== "ok") {
        if (!renovadas) return NextResponse.next();
        // La renovacion pudo dejar cookies nuevas aunque el rol no se haya
        // podido confirmar (backend inestable); se guardan igual en vez de
        // desperdiciarlas y forzar otra renovacion en la siguiente visita.
        const sinRol = NextResponse.next({
          request: { headers: request.headers },
        });
        for (const { name, value, options } of renovadas) {
          sinRol.cookies.set(name, value, options);
        }
        return sinRol;
      }

      return conCookies(
        redirectFromRequest(request, inicioParaRol(sesion.rol)),
        renovadas,
      );
    }

    // B) Rutas protegidas de /admin/* y /jefe/*.
    /*
     * Sin access token, pero eso no significa que la sesion haya terminado: la
     * cookie tiene la vida corta del token y el navegador la borra sola al
     * caducar. Ese es justo el momento de renovar. Las cookies nuevas van a dos
     * sitios: a la peticion, para que el render de esta misma pagina ya vea la
     * sesion renovada, y a la respuesta, para que el navegador las guarde.
     */
    const renovadas = await renovarSiHaceFalta(request);
    if (!request.cookies.has(ACCESS_COOKIE)) {
      return redirectFromRequest(request, "/admin");
    }

    /*
     * C) El rol, que es lo que faltaba.
     *
     * Hasta aqui bastaba con TENER sesion: cualquier cuenta autenticada —un
     * jefe, una empleada, un chofer— podia abrir cualquier pagina de `/admin`.
     * Y el boton "Abrir en el panel" que se manda al grupo del jefe llevaba una
     * ruta de administracion, asi que el jefe acababa dentro del panel de admin
     * ya autenticado sin haber hecho nada raro.
     */
    const area = isAdminRoute ? "admin" : "jefe";
    const sesion = await rolDeLaSesion(buildCookieHeader(request));
    if (sesion.estado === "sin-sesion") {
      return redirectFromRequest(request, "/admin");
    }
    /*
     * Con el backend incomunicado se deja pasar en vez de mandar al login.
     *
     * No se puede comprobar el rol, pero tampoco se puede servir ningun dato:
     * todo lo que pinta la pagina sale del mismo backend que no contesta, asi
     * que lo que se ve es una pantalla degradada, no informacion de otro rol. A
     * cambio, un bache de unos segundos deja de costar la sesion de todos.
     */
    if (sesion.estado === "ok" && !puedeEntrarEn(area, sesion.rol)) {
      return redirectFromRequest(request, inicioParaRol(sesion.rol));
    }

    return conCookies(
      NextResponse.next({ request: { headers: request.headers } }),
      renovadas,
    );
  }

  /*
   * Todo lo demas del matcher, que renueva igual.
   *
   * Aqui caen los ajustes de cada portal y, sobre todo, `/api/realtime/sse`:
   * la rama de arriba lo excluye a proposito --lo sirve una ruta propia de
   * Next-- y es el canal por el que llegan los avisos en vivo. Se reconecta
   * solo cada vez que se cae, asi que sin renovar, en cuanto caducaba el acceso
   * esa reconexion chocaba con un 401 una y otra vez y las notificaciones se
   * apagaban en silencio hasta que alguien navegara a otra pagina.
   */
  return conCookies(
    NextResponse.next({ request: { headers: request.headers } }),
    await renovarSiHaceFalta(request),
  );
}

/*
 * Las pantallas nuevas de cada portal --el servicio en curso y los ajustes de
 * avisos-- se enumeran una a una, igual que los portales.
 *
 * No se usa `/empleada/:path*` porque el bloque de canje de token de arriba
 * distingue rutas exactas, y ampliarlo a comodin haria pasar por el canje a
 * pantallas que no lo necesitan. La autorizacion de verdad la hace el backend;
 * esto solo evita que quien no tiene sesion aterrice en una pagina rota.
 */
export const config = {
  matcher: [
    "/api/:path*",
    "/admin/:path*",
    "/jefe/:path*",
    "/empleada/portal",
    "/empleada/servicio",
    "/empleada/ajustes",
    "/chofer/portal",
    "/chofer/servicio",
    "/chofer/ajustes",
  ],
};
