import { devices, expect, test, type Page } from '@playwright/test';

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

async function openHydratedAdmin(page: Page, reload = false) {
  const hydrated = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/version',
  );
  await (reload ? page.reload() : page.goto('/admin'));
  expect((await hydrated).ok()).toBeTruthy();
}

async function dispatchInstallEvent(page: Page) {
  return page.evaluate(async () => {
    const installWindow = window as Window & { __installPromptCalls?: number };
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: string }>;
    };
    event.prompt = async () => {
      installWindow.__installPromptCalls = (installWindow.__installPromptCalls ?? 0) + 1;
    };
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(event);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    return {
      defaultPrevented: event.defaultPrevented,
      promptCalls: installWindow.__installPromptCalls ?? 0,
    };
  });
}

async function expectNoAutomaticInstallationUi(page: Page) {
  await expect(page.getByText('Instala la aplicación', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /instalar aplicación|ver instrucciones/i })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Instala la aplicación' })).toHaveCount(0);
  await expect(page.getByText('1. Abre esta página en Safari.')).toHaveCount(0);
}

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

test('Android install events stay captured without automatic prompts or banners', async ({ page }) => {
  await page.setViewportSize({ width: 384, height: 848 });
  await openHydratedAdmin(page);
  await expectNoAutomaticInstallationUi(page);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    expect(await dispatchInstallEvent(page)).toEqual({ defaultPrevented: true, promptCalls: 0 });
    await expectNoAutomaticInstallationUi(page);
  }
  await openHydratedAdmin(page, true);
  await expectNoAutomaticInstallationUi(page);
  expect(await dispatchInstallEvent(page)).toEqual({ defaultPrevented: true, promptCalls: 0 });
  await expectNoAutomaticInstallationUi(page);
});

test('iPhone never opens the installation guide automatically, including after reload', async ({ browser }) => {
  const context = await browser.newContext({
    ...devices['iPhone 13'],
    locale: 'es-MX',
  });
  const page = await context.newPage();
  await openHydratedAdmin(page);
  await expectNoAutomaticInstallationUi(page);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    expect(await dispatchInstallEvent(page)).toEqual({ defaultPrevented: true, promptCalls: 0 });
    await expectNoAutomaticInstallationUi(page);
  }
  await openHydratedAdmin(page, true);
  await expectNoAutomaticInstallationUi(page);
  expect(await dispatchInstallEvent(page)).toEqual({ defaultPrevented: true, promptCalls: 0 });
  await expectNoAutomaticInstallationUi(page);
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
