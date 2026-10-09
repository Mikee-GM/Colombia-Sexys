export const INSTALL_DISMISSAL_MS = 14 * 24 * 60 * 60 * 1000;

export type PwaPlatform = "ios" | "android" | "desktop";

export type PwaCapabilities = {
  platform: PwaPlatform;
  installed: boolean;
  pushSupported: boolean;
  serviceWorkerSupported: boolean;
};

type NavigatorWithStandalone = Navigator & { standalone?: boolean };

export function detectPwaCapabilities(
  userAgent: string,
  standaloneMedia: boolean,
  navigatorStandalone = false,
  available: {
    serviceWorker: boolean;
    pushManager: boolean;
    notification: boolean;
  } = {
    serviceWorker: false,
    pushManager: false,
    notification: false,
  },
): PwaCapabilities {
  const ios = /iphone|ipad|ipod/i.test(userAgent);
  const android = /android/i.test(userAgent);
  return {
    platform: ios ? "ios" : android ? "android" : "desktop",
    installed: standaloneMedia || (ios && navigatorStandalone),
    serviceWorkerSupported: available.serviceWorker,
    pushSupported:
      available.serviceWorker &&
      available.pushManager &&
      available.notification,
  };
}

export function capabilitiesFromBrowser(): PwaCapabilities {
  return detectPwaCapabilities(
    navigator.userAgent,
    window.matchMedia("(display-mode: standalone)").matches,
    (navigator as NavigatorWithStandalone).standalone === true,
    {
      serviceWorker: "serviceWorker" in navigator,
      pushManager: "PushManager" in window,
      notification: "Notification" in window,
    },
  );
}

export function isStaffPath(pathname: string): boolean {
  return ["/jefe", "/empleada", "/chofer", "/admin"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function shouldShowInstallPromotion(
  capabilities: PwaCapabilities,
  dismissedAt: number | null,
  now = Date.now(),
): boolean {
  if (capabilities.installed) return false;
  return dismissedAt === null || now - dismissedAt >= INSTALL_DISMISSAL_MS;
}

export function isSafeInternalPath(value: unknown, fallback = "/"): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : fallback;
}
