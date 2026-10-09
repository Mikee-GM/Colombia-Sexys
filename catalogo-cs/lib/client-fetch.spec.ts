/** @jest-environment jsdom */

jest.mock('@/lib/client-session', () => ({
  refreshSession: jest.fn().mockResolvedValue('failed'),
}));

import { pedirConSesion } from './client-fetch';

describe('pedirConSesion offline', () => {
  it('does not queue or send an operational mutation while offline', async () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    global.fetch = jest.fn() as jest.Mock;

    await expect(
      pedirConSesion('/api/services/1/start', { method: 'POST' }),
    ).rejects.toThrow('Sin conexión');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
