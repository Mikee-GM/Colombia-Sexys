import { copyBackendCookies } from "@/lib/auth-cookies";
import { getApiBaseUrl } from "@/lib/api-server";
import { redirectToPath } from "@/lib/redirect";

/**
 * Canje del pase de vida corta que el bot le manda al jefe.
 *
 * Es un route handler y no una pagina porque hay que escribir cookies durante
 * una navegacion GET, y un Server Component no puede hacerlo.
 *
 * El destino no viaja en la URL: lo devuelve el backend desde el registro del
 * pase, para que nadie pueda cambiarlo editando el enlace antes de abrirlo.
 *
 * Los redirects salen con `Location` relativo: el origen se sacaba de
 * `request.url`, que detras del proxy es la direccion de escucha interna, y el
 * navegador acababa mandado a `http://0.0.0.0:3000/empleada/portal`.
 */
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  try {
    const response = await fetch(`${getApiBaseUrl()}/auth/panel-access`, {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.user) {
      return redirectToPath("/admin?acceso=caducado");
    }

    /* Si el pase no trae destino, cada rol aterriza donde le sirve. */
    const destinoPorRol =
      {
        jefe: "/jefe",
        admin: "/admin/dashboard",
        empleada: "/empleada/portal",
        chofer: "/chofer/portal",
      }[data.user.rol as string] ?? "/admin/dashboard";

    const redirect = redirectToPath(data.redirectPath || destinoPorRol);
    copyBackendCookies(response, redirect);
    return redirect;
  } catch (error) {
    console.error("Canje de acceso fallido:", error);
    return redirectToPath("/admin?acceso=error");
  }
}
