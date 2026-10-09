import {
  INSTALL_DISMISSAL_MS,
  detectPwaCapabilities,
  isSafeInternalPath,
  isStaffPath,
  shouldShowInstallPromotion,
} from './pwa';

describe('PWA capabilities', () => {
  it('detects an installed iPhone web app', () => {
    expect(
      detectPwaCapabilities('Mozilla/5.0 (iPhone)', false, true, {
        serviceWorker: true,
        pushManager: true,
        notification: true,
      }),
    ).toEqual({
      platform: 'ios',
      installed: true,
      serviceWorkerSupported: true,
      pushSupported: true,
    });
  });

  it('keeps the install dismissal for fourteen days', () => {
    const capabilities = detectPwaCapabilities('Android', false);
    const now = Date.now();
    expect(shouldShowInstallPromotion(capabilities, now, now)).toBe(false);
    expect(
      shouldShowInstallPromotion(
        capabilities,
        now - INSTALL_DISMISSAL_MS,
        now,
      ),
    ).toBe(true);
  });

  it('activates only on staff routes', () => {
    expect(isStaffPath('/jefe/historial')).toBe(true);
    expect(isStaffPath('/admin/dashboard')).toBe(true);
    expect(isStaffPath('/')).toBe(false);
    expect(isStaffPath('/modelos')).toBe(false);
  });

  it('accepts only same-origin relative notification paths', () => {
    expect(isSafeInternalPath('/chofer/portal')).toBe('/chofer/portal');
    expect(isSafeInternalPath('//attacker.test')).toBe('/');
    expect(isSafeInternalPath('https://attacker.test')).toBe('/');
  });
});
