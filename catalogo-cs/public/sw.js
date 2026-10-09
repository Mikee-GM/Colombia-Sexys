/* global self */

// Only public, immutable shell assets belong in this cache. Authenticated HTML,
// API responses, conversations and operational data are always network-only.
const SHELL_CACHE = "cs-shell-v2";
const SHELL_ASSETS = [
  "/offline",
  "/icono-192.png",
  "/logo-icono.png",
  "/icono-maskable-512.png",
  "/apple-touch-icon.png",
];
const PWA_DATABASE = "cs-pwa";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});

function safeInternalPath(value, fallback = "/") {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : fallback;
}

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return (
    url.pathname.startsWith("/_next/static/") ||
    SHELL_ASSETS.includes(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Mutations and all API/authenticated data are network-only. There is no
  // background sync and therefore no possibility of replaying an old action.
  if (request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match("/offline")) || Response.error();
      }),
    );
    return;
  }

  if (!isStaticAsset(url)) return;
  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    }),
  );
});

function writeLastNotification(isoDate) {
  if (!("indexedDB" in self)) return Promise.resolve();
  return new Promise((resolve) => {
    const request = indexedDB.open(PWA_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("meta")) {
        request.result.createObjectStore("meta");
      }
    };
    request.onerror = () => resolve();
    request.onsuccess = () => {
      const transaction = request.result.transaction("meta", "readwrite");
      transaction.objectStore("meta").put(isoDate, "lastNotificationAt");
      transaction.oncomplete = () => {
        request.result.close();
        resolve();
      };
      transaction.onerror = () => resolve();
    };
  });
}

async function setBadge() {
  if (typeof self.registration.setAppBadge !== "function") return;
  try {
    await self.registration.setAppBadge(1);
  } catch {
    // Badging is optional and must never prevent a notification.
  }
}

self.addEventListener("push", (event) => {
  let notice = {};
  try {
    notice = event.data ? event.data.json() : {};
  } catch {
    notice = {};
  }

  event.waitUntil(
    (async () => {
      const now = new Date().toISOString();
      await writeLastNotification(now);
      await setBadge();
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const visible = windows.filter((client) => client.visibilityState === "visible");
      if (visible.length > 0) {
        visible.forEach((client) =>
          client.postMessage({
            type: "PUSH_RECEIVED",
            title: notice.titulo || "Tienes una nueva actualización",
            eventId: notice.eventId,
          }),
        );
        return;
      }

      await self.registration.showNotification(notice.titulo || "Colombia Sexys", {
        body: notice.cuerpo || "Se requiere tu atención",
        icon: "/icono-192.png",
        badge: "/icono-192.png",
        tag: notice.tag || notice.eventId || undefined,
        renotify: Boolean(notice.tag || notice.eventId),
        requireInteraction: notice.requireInteraction === true,
        data: { url: safeInternalPath(notice.url, "/") },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destination = safeInternalPath(event.notification.data?.url, "/");
  event.waitUntil(
    (async () => {
      if (typeof self.registration.clearAppBadge === "function") {
        try {
          await self.registration.clearAppBadge();
        } catch {
          // Optional capability.
        }
      }
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of windows) {
        if (client.url.includes(destination) && "focus" in client) {
          return client.focus();
        }
      }
      for (const client of windows) {
        if ("navigate" in client && "focus" in client) {
          const navigated = await client.navigate(destination);
          return navigated ? navigated.focus() : null;
        }
      }
      return self.clients.openWindow(destination);
    })(),
  );
});
