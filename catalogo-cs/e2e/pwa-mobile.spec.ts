import { devices, expect, test } from '@playwright/test';

const viewports = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 360, height: 800 },
  { width: 375, height: 667 },
  { width: 384, height: 848 },
  { width: 390, height: 844 },
  { width: 393, height: 852 },
  { width: 412, height: 915 },
  { width: 414, height: 896 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 1024, height: 768 },
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
];

test('admin exposes an installable manifest with stable identity and icons', async ({ page, request }) => {
  await page.goto('/admin');
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest-admin.webmanifest',
  );

  const response = await request.get('/manifest-admin.webmanifest');
  expect(response.ok()).toBeTruthy();
  const manifest = (await response.json()) as {
    id: string;
    display: string;
    icons: Array<{ sizes: string; purpose?: string }>;
  };
  expect(manifest.id).toBe('/admin-panel');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192' }),
      expect.objectContaining({ sizes: '512x512' }),
      expect.objectContaining({ purpose: 'maskable' }),
    ]),
  );
});

test('Android install action invokes the captured native prompt', async ({ page }) => {
  await page.setViewportSize({ width: 384, height: 848 });
  await page.goto('/admin');
  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    event.prompt = async () => {
      (window as Window & { __installPromptCalled?: boolean }).__installPromptCalled = true;
    };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
  });

  await page.getByRole('button', { name: /instalar aplicación/i }).click();
  await expect
    .poll(() => page.evaluate(() => Boolean((window as Window & { __installPromptCalled?: boolean }).__installPromptCalled)))
    .toBe(true);
});

test('iPhone shows Safari installation instructions instead of a synthetic permission prompt', async ({ browser }) => {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'es-MX',
  });
  const page = await context.newPage();
  await page.goto('/admin');
  await page.getByRole('button', { name: /ver instrucciones/i }).click();
  await expect(page.getByText('1. Abre esta página en Safari.')).toBeVisible();
  await expect(page.getByText('4. Activa Abrir como app web.')).toBeVisible();
  await context.close();
});

test('offline mode hides private UI and blocks operational interaction', async ({ page, context }) => {
  await page.setViewportSize({ width: 384, height: 848 });
  await page.goto('/admin');
  await context.setOffline(true);
  await expect(page.getByRole('alertdialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sin conexión' })).toBeVisible();
  await context.setOffline(false);
});

test('every required viewport remains free of horizontal overflow', async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/offline');
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content, `${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(
      dimensions.viewport,
    );
  }
});
