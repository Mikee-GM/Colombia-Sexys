"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Send, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { refreshSession } from "@/lib/client-session";

/**
 * Activacion de los avisos push del panel, dispositivo por dispositivo.
 *
 * Existe porque un mensaje de Telegram que llega a un chat silenciado no avisa
 * a nadie: el aviso push lo lanza el sistema operativo y no depende de que la
 * aplicacion este abierta ni sin silenciar.
 *
 * La suscripcion es por navegador y por dispositivo. Quien la active en el
 * portatil y de por hecho que ya esta, seguira sin recibir nada en el telefono,
 * asi que todos los textos de aqui insisten en "este dispositivo".
 */

type Estado =
  | "cargando"
  | "sin-soporte"
  | "requiere-instalacion"
  | "sin-activar"
  | "activo"
  | "denegado";

/** La clave VAPID viaja en base64url y el navegador la quiere en bytes. */
function claveABytes(base64: string): Uint8Array {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalizada = (base64 + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(normalizada);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

function leerCsrf() {
  const prefijo = "csrf_token=";
  return (
    document.cookie
      .split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith(prefijo))
      ?.slice(prefijo.length) ?? ""
  );
}

/**
 * Llama al backend renovando la sesion si hace falta.
 *
 * El middleware renueva el access token al navegar a una pagina, pero las
 * peticiones del navegador a `/api/*` se reenvian al backend tal cual, sin
 * pasar por ese bloque. Como el access token dura una hora, la tarjeta se
 * llevaba un 401 en cuanto la app llevaba un rato abierta, y desde fuera
 * parecia que los avisos estaban rotos.
 *
 * Ante un 401 se renueva una vez y se repite. Si la renovacion tampoco vale,
 * la sesion termino de verdad y hay que volver a entrar.
 */
async function pedirConSesion(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const opciones: RequestInit = {
    ...init,
    credentials: "same-origin",
    headers: { ...(init.headers ?? {}), "x-csrf-token": leerCsrf() },
  };

  const respuesta = await fetch(url, opciones);
  if (respuesta.status !== 401) return respuesta;

  const renovada = await refreshSession();
  if (renovada !== "refreshed") return respuesta;

  // El CSRF se vuelve a leer: la renovacion emite una cookie nueva.
  return fetch(url, {
    ...opciones,
    headers: { ...(init.headers ?? {}), "x-csrf-token": leerCsrf() },
  });
}

/**
 * En iOS, Safari solo entrega avisos push si el sitio esta añadido a la
 * pantalla de inicio. No hay alternativa ni mensaje de error: simplemente no
 * llega nada, asi que hay que detectarlo y decirlo antes de que alguien crea
 * que lo activo.
 */
function esIosSinInstalar() {
  const esIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (!esIos) return false;
  const instalada =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true;
  return !instalada;
}

export default function AvisosPush() {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setEstado("sin-soporte");
      return;
    }
    if (esIosSinInstalar()) {
      setEstado("requiere-instalacion");
      return;
    }
    if (Notification.permission === "denied") {
      setEstado("denegado");
      return;
    }

    // Si este navegador ya tiene una suscripcion viva, el estado es "activo"
    // aunque el permiso se concediera hace meses.
    navigator.serviceWorker
      .getRegistration()
      .then((registro) => registro?.pushManager.getSubscription() ?? null)
      .then((suscripcion) => setEstado(suscripcion ? "activo" : "sin-activar"))
      .catch(() => setEstado("sin-activar"));
  }, []);

  const activar = useCallback(async () => {
    setOcupado(true);
    try {
      // El permiso se pide desde el clic y nunca al cargar: un navegador que ve
      // la peticion sin gesto la deniega sola, y ademas la deja denegada.
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "denegado" : "sin-activar");
        return;
      }

      const respuestaClave = await pedirConSesion("/api/push/clave-publica");
      if (respuestaClave.status === 401) {
        toast.error("Tu sesion caduco. Vuelve a entrar y reintenta.");
        return;
      }
      if (!respuestaClave.ok) throw new Error("No se pudo pedir la clave");
      const { clavePublica, activo } = (await respuestaClave.json()) as {
        clavePublica: string;
        activo: boolean;
      };
      if (!activo || !clavePublica) {
        toast.error("Los avisos push no estan configurados en el servidor.");
        return;
      }

      const registro = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const suscripcion = await registro.pushManager.subscribe({
        // Sin esto el navegador no acepta la suscripcion: exige que todo aviso
        // se muestre, no permite usar el canal en segundo plano.
        userVisibleOnly: true,
        applicationServerKey: claveABytes(clavePublica) as BufferSource,
      });

      const datos = suscripcion.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      // Se manda solo lo que el backend valida. `toJSON()` incluye ademas
      // `expirationTime`, y el ValidationPipe rechaza los campos de mas.
      const alta = await pedirConSesion("/api/push/suscripciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: datos.endpoint,
          keys: { p256dh: datos.keys?.p256dh, auth: datos.keys?.auth },
        }),
      });
      if (!alta.ok) throw new Error("El servidor rechazo la suscripcion");

      setEstado("activo");
      toast.success("Avisos activados en este dispositivo.");
    } catch (error) {
      toast.error("No se pudieron activar los avisos en este dispositivo.");
      console.error(error);
    } finally {
      setOcupado(false);
    }
  }, []);

  const desactivar = useCallback(async () => {
    setOcupado(true);
    try {
      const registro = await navigator.serviceWorker.getRegistration();
      const suscripcion = await registro?.pushManager.getSubscription();
      if (suscripcion) {
        await pedirConSesion("/api/push/suscripciones", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: suscripcion.endpoint }),
        });
        await suscripcion.unsubscribe();
      }
      setEstado("sin-activar");
      toast.success("Este dispositivo ya no recibira avisos.");
    } catch (error) {
      toast.error("No se pudo desactivar. Intenta de nuevo.");
      console.error(error);
    } finally {
      setOcupado(false);
    }
  }, []);

  const probar = useCallback(async () => {
    setOcupado(true);
    try {
      const respuesta = await pedirConSesion("/api/push/prueba", {
        method: "POST",
      });
      if (respuesta.status === 401) {
        toast.error("Tu sesion caduco. Vuelve a entrar y reintenta.");
        return;
      }
      if (!respuesta.ok) throw new Error("El servidor rechazo la prueba");
      const { enviados } = (await respuesta.json()) as { enviados: number };
      if (enviados === 0) {
        toast.error(
          "No se envio a ningun dispositivo. Vuelve a activar los avisos aqui.",
        );
        return;
      }
      toast.success(
        enviados === 1
          ? "Aviso enviado. Deberia aparecer en un momento."
          : `Aviso enviado a ${enviados} dispositivos.`,
      );
    } catch (error) {
      toast.error("No se pudo enviar el aviso de prueba.");
      console.error(error);
    } finally {
      setOcupado(false);
    }
  }, []);

  if (estado === "cargando") return null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
      <div className="flex items-start gap-3">
        <Icono estado={estado} />
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            Avisos en este dispositivo
          </h2>
          <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
            {textoDe(estado)}
          </p>

          {estado === "sin-activar" && (
            <button
              type="button"
              disabled={ocupado}
              onClick={activar}
              className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-300 transition-colors hover:border-[#C5A55A] hover:text-[#C5A55A] disabled:opacity-50"
            >
              <Bell size={14} />
              Activar avisos aqui
            </button>
          )}

          {estado === "activo" && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={ocupado}
                onClick={probar}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-300 transition-colors hover:border-[#C5A55A] hover:text-[#C5A55A] disabled:opacity-50"
              >
                <Send size={14} />
                Enviar prueba
              </button>
              <button
                type="button"
                disabled={ocupado}
                onClick={desactivar}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-800 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300 disabled:opacity-50"
              >
                <BellOff size={14} />
                Desactivar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Icono({ estado }: { estado: Estado }) {
  const clase = "mt-0.5 shrink-0";
  if (estado === "activo")
    return <BellRing size={16} className={`${clase} text-[#C5A55A]`} />;
  if (estado === "requiere-instalacion")
    return <Smartphone size={16} className={`${clase} text-zinc-500`} />;
  if (estado === "denegado" || estado === "sin-soporte")
    return <BellOff size={16} className={`${clase} text-zinc-600`} />;
  return <Bell size={16} className={`${clase} text-zinc-500`} />;
}

function textoDe(estado: Estado) {
  switch (estado) {
    case "activo":
      return "Este dispositivo recibe los avisos de servicios pendientes aunque tengas Telegram silenciado. Actívalos tambien en los demas equipos que uses.";
    case "sin-activar":
      return "Recibe un aviso del sistema cuando haya un servicio esperando tu autorizacion, aunque Telegram este silenciado. Hay que activarlo en cada dispositivo por separado.";
    case "requiere-instalacion":
      return "En iPhone los avisos solo funcionan con el panel añadido a la pantalla de inicio. Abre el menu de compartir de Safari, elige Añadir a pantalla de inicio y vuelve a entrar desde ahi.";
    case "denegado":
      return "Bloqueaste los avisos en este navegador y no se pueden volver a pedir desde aqui. Permitelos en los ajustes del sitio y recarga la pagina.";
    case "sin-soporte":
      return "Este navegador no admite avisos push. Abre el panel en Chrome o en Safari.";
    default:
      return "";
  }
}
