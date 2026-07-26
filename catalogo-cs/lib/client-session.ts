"use client";

const LOGOUT_CHANNEL = "cs-auth";

export type RefreshResult = "refreshed" | "unauthorized" | "network-error";

let refreshResultPromise: Promise<RefreshResult> | null = null;

function readCsrfToken() {
  const prefix = "csrf_token=";
  return document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(prefix))
    ?.slice(prefix.length);
}

export function refreshSession(): Promise<RefreshResult> {
  if (refreshResultPromise) return refreshResultPromise;

  refreshResultPromise = fetch("/api/auth/refresh", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "x-csrf-token": readCsrfToken() ?? "",
    },
  })
    .then((response) => {
      if (response.ok) return "refreshed" as const;
      if (response.status === 401 || response.status === 403) {
        return "unauthorized" as const;
      }
      return "network-error" as const;
    })
    .catch(() => "network-error" as const)
    .finally(() => {
      refreshResultPromise = null;
    });

  return refreshResultPromise;
}

export function broadcastLogout() {
  const channel = new BroadcastChannel(LOGOUT_CHANNEL);
  channel.postMessage("logout");
  channel.close();
}

export function subscribeToLogout(callback: () => void) {
  const channel = new BroadcastChannel(LOGOUT_CHANNEL);
  channel.addEventListener("message", callback);
  return () => channel.close();
}
