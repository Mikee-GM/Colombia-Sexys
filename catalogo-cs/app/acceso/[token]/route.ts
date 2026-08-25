import { NextResponse } from "next/server";

import { copyBackendCookies } from "@/lib/auth-cookies";
import { getApiBaseUrl } from "@/lib/api-server";

/**
 * Canje del pase de un solo uso que el bot le manda al jefe.
 *
 * Es un route handler y no una pagina porque hay que escribir cookies durante
 * una navegacion GET, y un Server Component no puede hacerlo.
 *
 * El destino no viaja en la URL: lo devuelve el backend desde el registro del
 * pase, para que nadie pueda cambiarlo editando el enlace antes de abrirlo.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const origen = new URL(request.url).origin;

  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/panel-access`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.user) {
      return NextResponse.redirect(
        new URL("/admin?acceso=caducado", origen),
      );
    }

    /* Si el pase no trae destino, cada rol aterriza donde le sirve. */
    const destinoPorRol =
      {
        jefe: "/jefe",
        admin: "/admin/dashboard",
        empleada: "/empleada/portal",
        chofer: "/chofer/portal",
      }[data.user.rol as string] ?? "/admin/dashboard";

    const redirect = NextResponse.redirect(
      new URL(data.redirectPath || destinoPorRol, origen),
    );
    copyBackendCookies(response, redirect);
    return redirect;
  } catch (error) {
    console.error("Canje de acceso fallido:", error);
    return NextResponse.redirect(new URL("/admin?acceso=error", origen));
  }
}
