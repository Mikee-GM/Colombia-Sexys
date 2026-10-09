/** @jest-environment jsdom */

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PwaProvider from './PwaProvider';

jest.mock('next/navigation', () => ({ usePathname: () => '/jefe' }));
jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() }) }));

type InstallEvent = Event & {
  prompt: jest.Mock<Promise<void>, []>;
  userChoice: Promise<{ outcome: 'accepted' }>;
};

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
    render(<PwaProvider><main>Panel</main></PwaProvider>);
    const installEvent = new Event('beforeinstallprompt') as InstallEvent;
    installEvent.prompt = jest.fn().mockResolvedValue(undefined);
    installEvent.userChoice = Promise.resolve({ outcome: 'accepted' });

    act(() => window.dispatchEvent(installEvent));
    fireEvent.click(await screen.findByRole('button', { name: /instalar aplicaci/i }));

    await waitFor(() => expect(installEvent.prompt).toHaveBeenCalledTimes(1));
  });

  it('shows the complete iOS Safari installation guide', async () => {
    prepareBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
    render(<PwaProvider><main>Panel</main></PwaProvider>);

    fireEvent.click(await screen.findByRole('button', { name: /ver instrucciones/i }));

    expect(await screen.findByText('1. Abre esta página en Safari.')).not.toBeNull();
    expect(screen.getByText('4. Activa Abrir como app web.')).not.toBeNull();
  });

  it('blocks all staff interaction while offline', async () => {
    prepareBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/124');
    render(<PwaProvider><button type="button">Operar</button></PwaProvider>);

    act(() => window.dispatchEvent(new Event('offline')));

    expect(await screen.findByRole('alertdialog')).not.toBeNull();
    expect(screen.getByText('Sin conexión')).not.toBeNull();
  });
});
