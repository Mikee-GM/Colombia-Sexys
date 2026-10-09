"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { BellRing, Download, RefreshCw, Share2, WifiOff, X } from "lucide-react";
import { toast } from "sonner";
import {
  capabilitiesFromBrowser,
  isStaffPath,
  shouldShowInstallPromotion,
  type PwaCapabilities,
} from "@/lib/pwa";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

type PwaContextValue = {
  capabilities: PwaCapabilities | null;
  installPromptAvailable: boolean;
  lastNotificationAt: string | null;
  promptInstall(): Promise<boolean>;
  showInstallHelp(): void;
  refreshLastNotification(): Promise<void>;
};

const PwaContext = createContext<PwaContextValue | null>(null);
const DISMISSED_KEY = "cs:pwa-install-dismissed-at";
const DATABASE = "cs-pwa";

export function usePwa(): PwaContextValue | null {
  return useContext(PwaContext);
}

async function readLastNotification(): Promise<string | null> {
  if (!("indexedDB" in window)) return null;
  return new Promise((resolve) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("meta")) {
        request.result.createObjectStore("meta");
      }
    };
    request.onerror = () => resolve(null);
    request.onsuccess = () => {
      const transaction = request.result.transaction("meta", "readonly");
      const value = transaction.objectStore("meta").get("lastNotificationAt");
      value.onerror = () => resolve(null);
      value.onsuccess = () =>
        resolve(typeof value.result === "string" ? value.result : null);
      transaction.oncomplete = () => request.result.close();
    };
  });
}

export default function PwaProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const staff = isStaffPath(pathname);
  const [capabilities, setCapabilities] = useState<PwaCapabilities | null>(null);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [promotionVisible, setPromotionVisible] = useState(false);
  const [online, setOnline] = useState(true);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [lastNotificationAt, setLastNotificationAt] = useState<string | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const loadedVersion = useRef<string | null>(null);

  const refreshLastNotification = useCallback(async () => {
    setLastNotificationAt(await readLastNotification());
  }, []);

  useEffect(() => {
    if (!staff) return;
    const next = capabilitiesFromBrowser();
    setCapabilities(next);
    setOnline(navigator.onLine);
    const dismissedValue = Number.parseInt(
      window.localStorage.getItem(DISMISSED_KEY) ?? "",
      10,
    );
    setPromotionVisible(
      shouldShowInstallPromotion(
        next,
        Number.isFinite(dismissedValue) ? dismissedValue : null,
      ),
    );
    void refreshLastNotification();

    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setPromotionVisible(!next.installed);
    };
    const installed = () => {
      setInstallPrompt(null);
      setPromotionVisible(false);
      setCapabilities(capabilitiesFromBrowser());
    };
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", installed);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", installed);
      window.removeEventListener("online", connected);
      window.removeEventListener("offline", disconnected);
    };
  }, [refreshLastNotification, staff]);

  useEffect(() => {
    if (!staff || !("serviceWorker" in navigator)) return;
    let active = true;
    const markWaiting = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting) setUpdateAvailable(true);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            setUpdateAvailable(true);
          }
        });
      });
    };
    void navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (!active) return;
      registrationRef.current = registration;
      markWaiting(registration);
    });

    const message = (event: MessageEvent<{ type?: string; title?: string }>) => {
      if (event.data?.type !== "PUSH_RECEIVED") return;
      void refreshLastNotification();
      if (document.visibilityState === "visible") {
        toast(event.data.title || "Tienes una nueva actualización", {
          icon: <BellRing size={16} />,
        });
      }
    };
    navigator.serviceWorker.addEventListener("message", message);
    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener("message", message);
    };
  }, [refreshLastNotification, staff]);

  useEffect(() => {
    if (!staff) return;
    let cancelled = false;
    async function checkVersion() {
      try {
        const response = await fetch("/api/version", { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const { version } = (await response.json()) as { version?: string };
        if (!version) return;
        if (loadedVersion.current === null) loadedVersion.current = version;
        else if (loadedVersion.current !== version) setUpdateAvailable(true);
      } catch {
        // Offline is represented by the connectivity guard; retry on focus.
      }
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkVersion();
    };
    void checkVersion();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [staff]);

  useEffect(() => {
    if (!staff || document.visibilityState !== "visible") return;
    const navigatorWithBadge = navigator as Navigator & {
      clearAppBadge?: () => Promise<void>;
    };
    void navigatorWithBadge.clearAppBadge?.().catch(() => undefined);
  }, [pathname, staff]);

  const promptInstall = useCallback(async () => {
    if (!installPrompt) {
      setInstallHelpOpen(true);
      return false;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") setPromotionVisible(false);
    return choice.outcome === "accepted";
  }, [installPrompt]);

  const dismissPromotion = useCallback(() => {
    window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    setPromotionVisible(false);
  }, []);

  const applyUpdate = useCallback(async () => {
    setUpdating(true);
    try {
      const registration =
        registrationRef.current ??
        (await navigator.serviceWorker.getRegistration("/"));
      await registration?.update();
      if (registration?.waiting) {
        await new Promise<void>((resolve) => {
          const changed = () => resolve();
          navigator.serviceWorker.addEventListener("controllerchange", changed, {
            once: true,
          });
          registration.waiting?.postMessage({ type: "SKIP_WAITING" });
          window.setTimeout(resolve, 3000);
        });
      }
      window.location.reload();
    } finally {
      setUpdating(false);
    }
  }, []);

  const value = useMemo<PwaContextValue>(
    () => ({
      capabilities,
      installPromptAvailable: installPrompt !== null,
      lastNotificationAt,
      promptInstall,
      showInstallHelp: () => setInstallHelpOpen(true),
      refreshLastNotification,
    }),
    [capabilities, installPrompt, lastNotificationAt, promptInstall, refreshLastNotification],
  );

  return (
    <PwaContext.Provider value={value}>
      {children}
      {staff && !online && <OfflineGuard />}
      {staff && updateAvailable && (
        <div className="fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[100] mx-auto flex max-w-md items-center gap-3 rounded-xl border border-[#C5A55A]/50 bg-zinc-950 p-3 shadow-2xl">
          <RefreshCw className="shrink-0 text-[#C5A55A]" size={18} />
          <p className="min-w-0 flex-1 text-xs font-semibold text-zinc-200">
            Nueva versión disponible
          </p>
          <button
            type="button"
            onClick={() => void applyUpdate()}
            disabled={updating}
            aria-busy={updating}
            className="min-h-11 rounded-lg bg-[#C5A55A] px-4 text-xs font-bold uppercase tracking-wider text-black"
          >
            Actualizar
          </button>
        </div>
      )}
      {staff && promotionVisible && capabilities && (
        <div className="fixed inset-x-3 bottom-[max(1rem,env(safe-area-inset-bottom))] z-[90] mx-auto max-w-md rounded-xl border border-zinc-700 bg-zinc-950 p-4 shadow-2xl">
          <button
            type="button"
            aria-label="Recordar después"
            onClick={dismissPromotion}
            className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center text-zinc-500"
          >
            <X size={18} />
          </button>
          <div className="pr-10">
            <p className="text-sm font-semibold text-white">Instala la aplicación</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">
              Accede al panel como app y habilita avisos operativos en este dispositivo.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void promptInstall()}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#C5A55A] px-4 text-xs font-bold uppercase tracking-wider text-black"
          >
            <Download size={16} />
            {installPrompt ? "Instalar aplicación" : "Ver instrucciones"}
          </button>
        </div>
      )}
      {staff && installHelpOpen && capabilities && (
        <InstallHelp
          platform={capabilities.platform}
          onClose={() => setInstallHelpOpen(false)}
        />
      )}
    </PwaContext.Provider>
  );
}

function OfflineGuard() {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-[120] flex min-h-dvh items-center justify-center bg-black px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-center"
    >
      <div className="max-w-sm">
        <WifiOff className="mx-auto text-[#C5A55A]" size={40} />
        <h1 className="mt-5 font-heading text-2xl text-white">Sin conexión</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-400">
          La información privada no se guarda offline. Recupera la conexión para continuar con cualquier acción operativa.
        </p>
      </div>
    </div>
  );
}

function InstallHelp({
  platform,
  onClose,
}: {
  platform: PwaCapabilities["platform"];
  onClose(): void;
}) {
  const ios = platform === "ios";
  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-5"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="install-title" className="font-heading text-xl text-white">
              Instala la aplicación
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              {ios ? "En iPhone y iPad se instala desde Safari." : "Instálala desde el menú de tu navegador."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-800 text-zinc-400"
          >
            <X size={18} />
          </button>
        </div>
        {ios ? (
          <ol className="mt-5 space-y-3 text-sm leading-relaxed text-zinc-300">
            <li>1. Abre esta página en Safari.</li>
            <li className="flex items-center gap-2">2. Pulsa Compartir <Share2 size={16} />.</li>
            <li>3. Pulsa Agregar a pantalla de inicio.</li>
            <li>4. Activa Abrir como app web.</li>
            <li>5. Pulsa Agregar.</li>
          </ol>
        ) : (
          <p className="mt-5 text-sm leading-relaxed text-zinc-300">
            Abre el menú del navegador y elige Instalar aplicación o Agregar a pantalla principal.
          </p>
        )}
      </section>
    </div>
  );
}
