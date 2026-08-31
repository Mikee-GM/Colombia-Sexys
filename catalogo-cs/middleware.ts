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
 * Rol de la sesion, segun el backend.
 *
 * Se pregunta a `/auth/me` en vez de leer el JWT aqui: el backend verifica la
 * firma y comprueba que la sesion siga viva, mientras que descodificar el token
 * en el middleware daria por bueno cualquier payload que alguien pusiera en la
 * cookie. Una decision de autorizacion no puede apoyarse en un dato sin
 * verificar.
 */
async function rolDeLaSesion(cookieHeader: string): Promise<string | null> {
  if (!cookieHeader) return null;
  const destino = new URL(
    `${BACKEND_API_PREFIX}/auth/me`,
    backendUrl(),
  );
  try {
    const response = await fetch(destino, {
      cache: "no-store",
      headers: { Cookie: cookieHeader },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { rol?: unknown };
    return typeof data?.rol === "string" ? data.rol : null;
  } catch {
    // Backend inalcanzable: sin poder comprobar el rol no se deja pasar.
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 1. Proxy /api/* requests to NestJS backend (excluding Next.js internal API routes)
  if (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/assistant") &&
    !pathname.startsWith("/api/auth") &&
    !pathname.startsWith("/api/geocode") &&
    !pathname.startsWith("/api/health") &&
    !pathname.startsWith("/api/realtime")
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
    return NextResponse.rewrite(targetUrl, { request: { headers: cabeceras } });
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
      let renovadas: ParsedCookie[] | null = null;
      if (!request.cookies.has(ACCESS_COOKIE)) {
        renovadas = await renovarSesion(request);
        if (renovadas) {
          for (const { name, value } of renovadas) {
            request.cookies.set(name, value);
          }
        }
      }

      const rol = await rolDeLaSesion(buildCookieHeader(request));
      if (!rol) {
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

      const destino = redirectFromRequest(request, inicioParaRol(rol));
      if (renovadas) {
        for (const { name, value, options } of renovadas) {
          destino.cookies.set(name, value, options);
        }
      }
      return destino;
    }

    // B) Rutas protegidas de /admin/* y /jefe/*.
    let renovadas: ParsedCookie[] | null = null;

    if (!request.cookies.has(ACCESS_COOKIE)) {
      /*
       * Sin access token, pero eso no significa que la sesion haya terminado:
       * la cookie tiene la vida corta del token y el navegador la borra sola al
       * caducar. Ese es justo el momento de renovar, y lo que antes faltaba: se
       * redirigia al login a quien tenia sesion perfectamente valida, cada vez
       * que recargaba pasados quince minutos.
       */
      renovadas = await renovarSesion(request);
      if (!renovadas) {
        return redirectFromRequest(request, "/admin");
      }
      /*
       * Las cookies nuevas van a dos sitios: a la peticion, para que el render
       * de esta misma pagina ya vea la sesion renovada y no haga falta un viaje
       * de ida y vuelta; y a la respuesta, para que el navegador las guarde.
       */
      for (const { name, value } of renovadas) {
        request.cookies.set(name, value);
      }
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
    const rol = await rolDeLaSesion(buildCookieHeader(request));
    if (!rol) {
      return redirectFromRequest(request, "/admin");
    }
    if (!puedeEntrarEn(area, rol)) {
      return redirectFromRequest(request, inicioParaRol(rol));
    }

    if (!renovadas) {
      return NextResponse.next();
    }
    const response = NextResponse.next({
      request: { headers: request.headers },
    });
    for (const { name, value, options } of renovadas) {
      response.cookies.set(name, value, options);
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*", "/jefe/:path*"],
};
