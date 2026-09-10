import { getApiBaseUrl } from "@/lib/api-server";

export const dynamic = "force-dynamic";

/**
 * Proxy de SSE para el portal del chofer.
 *
 * A diferencia de /api/realtime/sse (jefes), este canal no tiene una sesion
 * completa con cookie firmada: el portal se abre desde una Mini App de
 * Telegram con un token de portal de larga duracion, que llega en la propia
 * URL. Por eso se reenvia igual, por query, hacia PortalAuthGuard en el
 * backend, que si sabe verificar ese tipo de token.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("token");
  if (!token) {
    return new Response("No autorizado", { status: 401 });
  }

  const apiBaseUrl = getApiBaseUrl();
  const backendUrl = `${apiBaseUrl}/realtime/sse/chofer?token=${encodeURIComponent(token)}`;

  try {
    const response = await fetch(backendUrl, {
      headers: {
        Accept: "text/event-stream",
        "Cache-Control": "no-cache",
      },
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
    console.error("Error en proxy SSE de chofer:", error);
    return new Response("Error interno del servidor proxy SSE", {
      status: 500,
    });
  }
}
