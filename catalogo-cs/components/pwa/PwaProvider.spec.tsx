/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PwaProvider, { usePwa } from './PwaProvider';

jest.mock('next/navigation', () => ({ usePathname: () => '/jefe' }));
jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));

type InstallEvent = Event & {
  prompt: jest.Mock<Promise<void>, []>;
  userChoice: Promise<{ outcome: 'accepted' }>;
};

function ManualInstallActions() {
  const pwa = usePwa();
  return (
    <button type="button" onClick={() => void pwa?.promptInstall()}>
      Instalar desde Ajustes
    </button>
  );
}

function createInstallEvent(): InstallEvent {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as InstallEvent;
  event.prompt = jest.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  return event;
}

const registration = {
  waiting: null,
  installing: null,
  update: jest.fn().mockResolvedValue(undefined),
  addEventListener: jest.fn(),
};

function prepareBrowser(userAgent: string, standalone = false) {
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  });
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: true,
  });
  Object.defineProperty(window, 'PushManager', {
    configurable: true,
    value: function PushManager() {},
  });
  Object.defineProperty(window, 'Notification', {
    configurable: true,
    value: { permission: 'default' },
  });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: jest.fn().mockReturnValue({ matches: standalone }),
  });
  const listeners = new Map<string, EventListener>();
  Object.defineProperty(window.navigator, 'serviceWorker', {
    configurable: true,
    value: {
      controller: {},
      ready: Promise.resolve(registration),
      register: jest.fn().mockResolvedValue(registration),
      getRegistration: jest.fn().mockResolvedValue(registration),
      addEventListener: jest.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: jest.fn(),
    },
  });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ version: 'build-one' }),
  }) as jest.Mock;
}

describe('PwaProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.clearAllMocks();
  });

  it('uses the native Android install prompt only after a click', async () => {
    prepareBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/124');
    render(<PwaProvider><ManualInstallActions /></PwaProvider>);
    const installEvent = createInstallEvent();

    act(() => window.dispatchEvent(installEvent));
    expect(installEvent.defaultPrevented).toBe(true);
    expect(installEvent.prompt).not.toHaveBeenCalled();
    expect(screen.queryByText('Instala la aplicación')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Instalar desde Ajustes' }));

    await waitFor(() => expect(installEvent.prompt).toHaveBeenCalledTimes(1));
  });

  it('shows the iOS Safari installation guide only after an explicit request', async () => {
    prepareBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    render(<PwaProvider><ManualInstallActions /></PwaProvider>);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('Instala la aplicación')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Instalar desde Ajustes' }));

    expect(await screen.findByText('1. Abre esta página en Safari.')).not.toBeNull();
    expect(screen.getByText('4. Activa Abrir como app web.')).not.toBeNull();
  });

  it.each([
    'Mozilla/5.0 (Linux; Android 14) Chrome/124',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    'Mozilla/5.0 (Windows NT 10.0) Chrome/124',
  ])('never promotes installation on load, repeated events or remount: %s', async (userAgent) => {
    prepareBrowser(userAgent);
    const mounted = render(<PwaProvider><main>Panel</main></PwaProvider>);
    await waitFor(() => expect(navigator.serviceWorker.register).toHaveBeenCalled());
    expect(screen.queryByText('Instala la aplicación')).toBeNull();

    for (let index = 0; index < 2; index += 1) {
      const event = createInstallEvent();
      act(() => window.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(true);
      expect(event.prompt).not.toHaveBeenCalled();
      expect(screen.queryByText('Instala la aplicación')).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Recordar después' })).toBeNull();
    }

    mounted.unmount();
    render(<PwaProvider><main>Panel</main></PwaProvider>);
    expect(screen.queryByText('Instala la aplicación')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('preserves the available-version notice', async () => {
    prepareBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/124');
    render(<PwaProvider><main>Panel</main></PwaProvider>);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    jest.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ version: 'build-two' }),
    } as Response);
    act(() => window.dispatchEvent(new Event('focus')));
    expect(await screen.findByRole('button', { name: 'Actualizar' })).not.toBeNull();
    expect(screen.queryByText('Instala la aplicación')).toBeNull();
  });

  it('blocks all staff interaction while offline', async () => {
    prepareBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/124');
    render(<PwaProvider><button type="button">Operar</button></PwaProvider>);

    act(() => window.dispatchEvent(new Event('offline')));

    expect(await screen.findByRole('alertdialog')).not.toBeNull();
    expect(screen.getByText('Sin conexión')).not.toBeNull();
  });
});
