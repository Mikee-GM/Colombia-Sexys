import { getApiBaseUrl } from "@/lib/api-server";
import { getBackendCookieHeader, getCsrfToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Canales que este proxy sabe abrir.
 *
 * Estaba fijado al de jefes, asi que los portales de modelo y chofer no tenian
 * por donde enterarse de nada: se quedaban con los datos del primer render y
 * en una aplicacion instalada eso se ve como una pantalla congelada, porque no
 * hay ni un gesto de recargar.
 */
const CANALES: Record<string, string> = {
  jefes: "/realtime/sse/jefes",
  empleada: "/realtime/sse/empleada",
  chofer: "/realtime/sse/chofer",
};

export async function GET(request: Request) {
  const canal = new URL(request.url).searchParams.get("canal") ?? "jefes";
  const ruta = CANALES[canal];
  if (!ruta) {
    return new Response("Canal desconocido", { status: 400 });
  }

  const cookie = await getBackendCookieHeader();
  if (!cookie) {
    return new Response("No autorizado", { status: 401 });
  }

  const csrfToken = await getCsrfToken();
  const apiBaseUrl = getApiBaseUrl();
  const backendUrl = `${apiBaseUrl}${ruta}`;

  try {
    const headers: Record<string, string> = {
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
      Cookie: cookie,
    };

    if (csrfToken) {
      headers["x-csrf-token"] = csrfToken;
    }

    const response = await fetch(backendUrl, {
      headers,
      cache: "no-store",
    });

    if (!response.ok) {
      return new Response(`Error del backend: ${response.status}`, {
        status: response.status,
      });
    }

    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("Error en proxy SSE:", error);
    return new Response("Error interno del servidor proxy SSE", { status: 500 });
  }
}
