import { NextRequest } from "next/server";
import { getApiBaseUrl } from "@/lib/api-server";
import { getBackendCookieHeader, getCsrfToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const cookie = await getBackendCookieHeader();
  if (!cookie) {
    return new Response("No autorizado", { status: 401 });
  }

  const csrfToken = await getCsrfToken();
  const apiBaseUrl = getApiBaseUrl();
  const backendUrl = `${apiBaseUrl}/realtime/sse/jefes`;

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
