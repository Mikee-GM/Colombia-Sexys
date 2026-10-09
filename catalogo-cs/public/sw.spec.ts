import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('secure service worker policy', () => {
  const source = readFileSync(join(__dirname, 'sw.js'), 'utf8');

  it('keeps API requests network-only and never registers background sync', () => {
    expect(source).toContain('url.pathname.startsWith("/api/")');
    expect(source).not.toContain('sync.register');
    expect(source).not.toContain('addEventListener("sync"');
  });

  it('caches only the public shell and versioned static assets', () => {
    expect(source).toContain('/_next/static/');
    expect(source).toContain('SHELL_ASSETS.includes(url.pathname)');
    expect(source).not.toContain('cache.put(request, response.clone())\n      return response;\n    })\n  );\n});\n\nself.addEventListener("push"');
  });

  it('requires an explicit message before activating an update', () => {
    expect(source).toContain('event.data?.type === "SKIP_WAITING"');
    expect(source).not.toContain('addEventListener("install", () => self.skipWaiting())');
  });

  it('uses an internal destination and suppresses system UI for visible clients', () => {
    expect(source).toContain('client.visibilityState === "visible"');
    expect(source).toContain('type: "PUSH_RECEIVED"');
    expect(source).toContain('safeInternalPath(notice.url');
  });

  it('feature-detects app badges and handles notification clicks', () => {
    expect(source).toContain('typeof self.registration.setAppBadge');
    expect(source).toContain('typeof self.registration.clearAppBadge');
    expect(source).toContain('self.addEventListener("notificationclick"');
    expect(source).toContain('self.clients.openWindow(destination)');
  });
});
