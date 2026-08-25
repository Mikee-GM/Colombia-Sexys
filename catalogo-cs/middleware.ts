import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  REFRESH_COOKIE,
} from "@/lib/auth-constants";
import { BACKEND_API_VERSION } from "@/lib/api-constants";
import { parseSetCookieHeaders, type ParsedCookie } from "@/lib/set-cookie";
import { redirectToPath } from "@/lib/redirect";

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
    `/api/v${BACKEND_API_VERSION}/auth/refresh`,
    backendUrl(),
  );

  try {
    const response = await fetch(destino, {
      method: "POST",
      cache: "no-store",
      headers: {
        Cookie: request.headers.get("cookie") ?? "",
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

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // 1. Proxy /api/* requests to NestJS backend (excluding Next.js internal API routes)
  if (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/assistant") &&
    !pathname.startsWith("/api/auth") &&
    !pathname.startsWith("/api/health") &&
    !pathname.startsWith("/api/realtime")
  ) {
    // El backend publica toda su superficie bajo `/api/v1`. Aqui se traduce
    // `/api/algo` del navegador a `/api/v1/algo` del backend.
    const apiPath = pathname.replace(/^\/api/, `/api/${BACKEND_API_VERSION}`);
    const targetUrl = new URL(`${apiPath}${search}`, backendUrl());
    return NextResponse.rewrite(targetUrl);
  }

  // 2. Auth checks for /admin and /jefe routes
  const isAdminRoute = pathname.startsWith("/admin");
  const isJefeRoute = pathname.startsWith("/jefe");

  if (isAdminRoute || isJefeRoute) {
    // A) La pagina de login siempre se sirve.
    if (pathname === "/admin") {
      return NextResponse.next();
    }

    // B) Rutas protegidas de /admin/* y /jefe/*.
    if (request.cookies.has(ACCESS_COOKIE)) {
      return NextResponse.next();
    }

    /*
     * Sin access token, pero eso no significa que la sesion haya terminado: la
     * cookie tiene la vida corta del token y el navegador la borra sola al
     * caducar. Ese es justo el momento de renovar, y lo que antes faltaba: se
     * redirigia al login a quien tenia sesion perfectamente valida, cada vez
     * que recargaba pasados quince minutos.
     */
    const renovadas = await renovarSesion(request);
    if (!renovadas) {
      return redirectToPath("/admin");
    }

    /*
     * Las cookies nuevas van a dos sitios: a la peticion, para que el render de
     * esta misma pagina ya vea la sesion renovada y no haga falta un viaje de
     * ida y vuelta; y a la respuesta, para que el navegador las guarde.
     */
    for (const { name, value } of renovadas) {
      request.cookies.set(name, value);
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
