"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  BellOff,
  BellRing,
  CheckCircle2,
  Download,
  Laptop,
  Send,
  Smartphone,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { pedirConSesion } from "@/lib/client-fetch";
import { usePwa } from "@/components/pwa/PwaProvider";

type Estado =
  | "cargando"
  | "sin-soporte"
  | "requiere-instalacion"
  | "sin-activar"
  | "activo"
  | "denegado";

type DeviceStatus = {
  id: string;
  userAgent: string | null;
  enabled: boolean;
  lastSeenAt: string;
  lastSentAt: string | null;
  failureCount: number;
};

type ServerStatus = {
  configured: boolean;
  devices: DeviceStatus[];
};

function keyToBytes(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export default function AvisosPush() {
  const pwa = usePwa();
  const [state, setState] = useState<Estado>("cargando");
  const [busy, setBusy] = useState(false);
  const [permissionExplanation, setPermissionExplanation] = useState(false);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);

  const refresh = useCallback(async () => {
    const capabilities = pwa?.capabilities;
    if (!capabilities || !capabilities.pushSupported) {
      setState(capabilities ? "sin-soporte" : "cargando");
      return;
    }
    if (capabilities.platform === "ios" && !capabilities.installed) {
      setState("requiere-instalacion");
    } else if (Notification.permission === "denied") {
      setState("denegado");
    } else {
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        setState(subscription ? "activo" : "sin-activar");
        if (subscription) {
          await pedirConSesion("/api/push/suscripciones/vista", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
        }
      } catch {
        setState("sin-activar");
      }
    }

    try {
      const response = await pedirConSesion("/api/push/estado");
      if (response.ok) setServerStatus((await response.json()) as ServerStatus);
    } catch {
      // Device actions still work if the summary endpoint is temporarily down.
    }
  }, [pwa?.capabilities]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const subscribe = useCallback(async () => {
    setPermissionExplanation(false);
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denegado" : "sin-activar");
        return;
      }

      const keyResponse = await pedirConSesion("/api/push/clave-publica");
      if (keyResponse.status === 401) {
        toast.error("Tu sesión caducó. Vuelve a entrar y reintenta.");
        return;
      }
      if (!keyResponse.ok) throw new Error("No se pudo obtener la clave pública");
      const { clavePublica, activo } = (await keyResponse.json()) as {
        clavePublica: string;
        activo: boolean;
      };
      if (!activo || !clavePublica) {
        toast.error("Los avisos push no están configurados en el servidor.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyToBytes(clavePublica) as BufferSource,
      });
      const data = subscription.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      const response = await pedirConSesion("/api/push/suscripciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: data.endpoint,
          keys: { p256dh: data.keys?.p256dh, auth: data.keys?.auth },
        }),
      });
      if (!response.ok) throw new Error("El servidor rechazó la suscripción");
      toast.success("Notificaciones activadas en este dispositivo.");
      await refresh();
    } catch (error) {
      toast.error("No se pudieron activar las notificaciones.");
      console.error(error);
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const unsubscribe = useCallback(async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await pedirConSesion("/api/push/suscripciones", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("No se pudo desactivar en el servidor");
        await subscription.unsubscribe();
      }
      toast.success("Este dispositivo ya no recibirá notificaciones.");
      await refresh();
    } catch (error) {
      toast.error("No se pudo desactivar. Intenta de nuevo.");
      console.error(error);
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  const sendTest = useCallback(async () => {
    setBusy(true);
    try {
      const response = await pedirConSesion("/api/push/prueba", { method: "POST" });
      if (!response.ok) throw new Error("El servidor rechazó la prueba");
      const { enviados } = (await response.json()) as { enviados: number };
      if (enviados < 1) {
        toast.error("No se encontró ningún dispositivo activo.");
      } else {
        toast.success(
          enviados === 1
            ? "Notificación enviada a tu dispositivo."
            : `Notificación enviada a tus ${enviados} dispositivos.`,
        );
      }
    } catch (error) {
      toast.error("No se pudo enviar la notificación de prueba.");
      console.error(error);
    } finally {
      setBusy(false);
    }
  }, []);

  const activeDevices = useMemo(
    () => serverStatus?.devices.filter((device) => device.enabled) ?? [],
    [serverStatus],
  );

  if (state === "cargando") return null;

  return (
    <>
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex items-start gap-3">
          <StateIcon state={state} />
          <div className="min-w-0 flex-1">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
              Aplicación y notificaciones
            </h2>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
              {stateText(state)}
            </p>

            <dl className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
              <Status label="Aplicación instalada" value={pwa?.capabilities?.installed ? "Sí" : "No"} />
              <Status label="Navegador compatible" value={pwa?.capabilities?.pushSupported ? "Sí" : "No"} />
              <Status label="Permiso" value={permissionLabel()} />
              <Status label="Suscripción activa" value={state === "activo" ? "Sí" : "No"} />
              <Status label="Dispositivos suscritos" value={String(activeDevices.length)} />
              <Status
                label="Última notificación"
                value={
                  pwa?.lastNotificationAt
                    ? new Intl.DateTimeFormat("es-MX", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(pwa.lastNotificationAt))
                    : "Sin registro"
                }
              />
            </dl>

            <div className="mt-4 flex flex-wrap gap-2">
              {!pwa?.capabilities?.installed && (
                <button
                  type="button"
                  onClick={() => void pwa?.promptInstall()}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-4 text-xs font-bold uppercase tracking-wider text-zinc-300"
                >
                  <Download size={14} /> Instalar
                </button>
              )}
              {state === "sin-activar" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPermissionExplanation(true)}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#C5A55A] px-4 text-xs font-bold uppercase tracking-wider text-black disabled:opacity-50"
                >
                  <Bell size={14} /> Activar notificaciones
                </button>
              )}
              {state === "activo" && (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void sendTest()}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-700 px-4 text-xs font-bold uppercase tracking-wider text-zinc-300 disabled:opacity-50"
                  >
                    <Send size={14} /> Enviar prueba a mi usuario
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void unsubscribe()}
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-zinc-800 px-4 text-xs font-bold uppercase tracking-wider text-zinc-500 disabled:opacity-50"
                  >
                    <BellOff size={14} /> Desactivar
                  </button>
                </>
              )}
              {state === "requiere-instalacion" && (
                <button
                  type="button"
                  onClick={() => pwa?.showInstallHelp()}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#C5A55A] px-4 text-xs font-bold uppercase tracking-wider text-black"
                >
                  <Smartphone size={14} /> Ver cómo instalar
                </button>
              )}
            </div>

            {activeDevices.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-zinc-800 pt-3">
                {activeDevices.map((device) => (
                  <li key={device.id} className="flex min-h-11 items-center gap-2 text-xs text-zinc-400">
                    <Laptop size={14} className="shrink-0 text-zinc-600" />
                    <span className="min-w-0 flex-1 truncate">{device.userAgent || "Dispositivo"}</span>
                    <CheckCircle2 size={14} className="shrink-0 text-emerald-500" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {permissionExplanation && (
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center">
          <section role="dialog" aria-modal="true" aria-labelledby="permission-title" className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="permission-title" className="font-heading text-xl text-white">Activar notificaciones</h2>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  Activa las notificaciones para recibir nuevos servicios, viajes y alertas aunque la aplicación esté cerrada.
                </p>
              </div>
              <button type="button" aria-label="Cerrar" onClick={() => setPermissionExplanation(false)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400">
                <X size={18} />
              </button>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void subscribe()}
              className="mt-5 min-h-12 w-full rounded-lg bg-[#C5A55A] px-4 text-xs font-bold uppercase tracking-wider text-black disabled:opacity-50"
            >
              Continuar
            </button>
          </section>
        </div>
      )}
    </>
  );
}

function Status({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-black/20 px-3 py-2">
      <dt className="text-[10px] uppercase tracking-wider text-zinc-600">{label}</dt>
      <dd className="mt-1 font-semibold text-zinc-300">{value}</dd>
    </div>
  );
}

function StateIcon({ state }: { state: Estado }) {
  const className = "mt-0.5 shrink-0";
  if (state === "activo") return <BellRing size={17} className={`${className} text-[#C5A55A]`} />;
  if (state === "requiere-instalacion") return <Smartphone size={17} className={`${className} text-zinc-500`} />;
  if (state === "denegado" || state === "sin-soporte") return <BellOff size={17} className={`${className} text-zinc-600`} />;
  return <Bell size={17} className={`${className} text-zinc-500`} />;
}

function permissionLabel(): string {
  if (typeof Notification === "undefined") return "No disponible";
  return Notification.permission === "granted"
    ? "Permitido"
    : Notification.permission === "denied"
      ? "Bloqueado"
      : "Sin solicitar";
}

function stateText(state: Estado): string {
  switch (state) {
    case "activo":
      return "Este dispositivo puede recibir avisos operativos incluso con la aplicación cerrada.";
    case "sin-activar":
      return "La activación es explícita y se configura por separado en cada dispositivo.";
    case "requiere-instalacion":
      return "En iPhone y iPad primero debes instalar la aplicación desde Safari.";
    case "denegado":
      return "El navegador bloqueó el permiso. Habilítalo en los ajustes del sitio y recarga.";
    case "sin-soporte":
      return "Este navegador no admite notificaciones web push.";
    default:
      return "";
  }
}
