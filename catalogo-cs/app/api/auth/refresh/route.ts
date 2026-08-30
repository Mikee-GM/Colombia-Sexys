import { NextRequest, NextResponse } from "next/server";
import { getApiBaseUrl } from "@/lib/api-server";
import { copyBackendCookies } from "@/lib/auth-cookies";
import { buildCookieHeader } from "@/lib/set-cookie";

/**
 * Renovacion de la sesion pedida desde el navegador.
 *
 * Las cookies del backend NO se reenvian tal cual. Vienen con los atributos que
 * el backend considera correctos para si mismo, y dos de ellos no valen aqui:
 *
 *  - `Secure`: el backend lo pone siempre que corre con NODE_ENV=production,
 *    que es como arranca dentro de Docker. Si el panel se sirve por HTTP --una
 *    IP, un tunel, localhost-- el navegador descarta una cookie `Secure` sin
 *    decir nada. El login ya lo evitaba pasando por `parseSetCookieHeaders`,
 *    pero esta ruta reenviaba las cabeceras crudas, asi que la sesion se abria
 *    bien y despues no habia forma de renovarla: a los quince minutos, de
 *    vuelta al login.
 *  - `Domain`: si esta fijado y no coincide con el host por el que entra el
 *    navegador, la cookie tampoco se guarda.
 *
 * `copyBackendCookies` es el mismo saneado que usa el inicio de sesion. Los dos
 * caminos que abren sesion tienen que tratar las cookies igual; que no lo
 * hicieran es lo que hacia que uno funcionara y el otro no.
 */
export async function POST(request: NextRequest) {
  const response = await fetch(`${getApiBaseUrl()}/auth/refresh`, {
    method: "POST",
    cache: "no-store",
    headers: {
      Cookie: buildCookieHeader(request),
      "x-csrf-token": request.headers.get("x-csrf-token") ?? "",
    },
  });

  const body = await response.text();
  const nextResponse = new NextResponse(body || null, {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("content-type") ?? "application/json",
    },
  });
  copyBackendCookies(response, nextResponse);
  return nextResponse;
}
