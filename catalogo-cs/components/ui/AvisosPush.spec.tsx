/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import AvisosPush from "./AvisosPush";
import { pedirConSesion } from "@/lib/client-fetch";
import { usePwa } from "@/components/pwa/PwaProvider";

jest.mock("@/lib/client-fetch", () => ({ pedirConSesion: jest.fn() }));
jest.mock("@/components/pwa/PwaProvider", () => ({ usePwa: jest.fn() }));
jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

const pedir = pedirConSesion as jest.MockedFunction<typeof pedirConSesion>;
const usarPwa = usePwa as jest.MockedFunction<typeof usePwa>;

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  } as unknown as Response;
}

function prepareBrowser(permissionResult: NotificationPermission) {
  const requestPermission = jest.fn().mockResolvedValue(permissionResult);
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: { permission: "default", requestPermission },
  });
  Object.defineProperty(globalThis, "Notification", {
    configurable: true,
    value: window.Notification,
  });

  const subscription = {
    endpoint: "https://push.example/current-device",
    toJSON: () => ({
      endpoint: "https://push.example/current-device",
      keys: { p256dh: "public-key", auth: "auth-key" },
    }),
    unsubscribe: jest.fn().mockResolvedValue(true),
  };
  let activeSubscription: typeof subscription | null = null;
  const registration = {
    pushManager: {
      getSubscription: jest.fn(() => Promise.resolve(activeSubscription)),
      subscribe: jest.fn(async () => {
        activeSubscription = subscription;
        return subscription;
      }),
    },
  };
  Object.defineProperty(window.navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve(registration),
      getRegistration: jest.fn().mockResolvedValue(registration),
      register: jest.fn().mockResolvedValue(registration),
    },
  });
  return { requestPermission, registration };
}

describe("AvisosPush", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    usarPwa.mockReturnValue({
      capabilities: {
        platform: "desktop",
        installed: true,
        pushSupported: true,
        serviceWorkerSupported: true,
      },
      installPromptAvailable: false,
      lastNotificationAt: null,
      promptInstall: jest.fn().mockResolvedValue(false),
      showInstallHelp: jest.fn(),
      refreshLastNotification: jest.fn().mockResolvedValue(undefined),
    });
    pedir.mockResolvedValue(response({ configured: true, devices: [] }));
  });

  it("does not request permission until the user confirms the explanation", async () => {
    const { requestPermission } = prepareBrowser("denied");
    render(<AvisosPush />);

    fireEvent.click(
      await screen.findByRole("button", { name: /activar notificaciones/i }),
    );
    expect(requestPermission).not.toHaveBeenCalled();
    expect(
      screen.getByText(/recibir nuevos servicios, viajes y alertas/i),
    ).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(requestPermission).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/el navegador bloque/i)).not.toBeNull();
  });

  it("registers only the current device after permission is granted", async () => {
    const { requestPermission, registration } = prepareBrowser("granted");
    pedir.mockImplementation((url) => {
      if (url === "/api/push/clave-publica") {
        return Promise.resolve(
          response({ clavePublica: "AQIDBA", activo: true }),
        );
      }
      if (url === "/api/push/suscripciones") {
        return Promise.resolve(response({}, 201));
      }
      return Promise.resolve(response({ configured: true, devices: [] }));
    });
    render(<AvisosPush />);

    fireEvent.click(
      await screen.findByRole("button", { name: /activar notificaciones/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

    await waitFor(() =>
      expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1),
    );
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(pedir).toHaveBeenCalledWith(
      "/api/push/suscripciones",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
