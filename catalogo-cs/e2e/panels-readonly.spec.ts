import { expect, test, type BrowserContext, type Page } from '@playwright/test';

async function prepare(context: BrowserContext, role: 'admin' | 'jefe') {
  await context.addCookies([{
    name: 'access_token', value: `fixture-${role}`, url: 'http://127.0.0.1:3111',
  }]);
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname.endsWith('tile.openstreetmap.org')) {
      await route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#111"/></svg>',
      });
    } else if (url.hostname === '127.0.0.1') {
      await route.continue();
    } else {
      await route.abort();
    }
  });
}

async function noHorizontalOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    content: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport + 1);
}

test('map remains usable with a long directory on phone, tablet and desktop', async ({ page, context }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await prepare(context, 'jefe');
  await page.goto('/jefe/mapa');
  const map = page.locator('.leaflet-container');
  await expect(map).toBeVisible({ timeout: 60_000 });

  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 820, height: 1180 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await noHorizontalOverflow(page);
    await map.scrollIntoViewIfNeeded();
    const dimensions = await map.boundingBox();
    expect(dimensions?.height).toBeGreaterThanOrEqual(250);
    expect(dimensions?.width).toBeGreaterThan(200);
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    if (viewport.width === 390) {
      await page.screenshot({ path: testInfo.outputPath('map-mobile.png') });
    }
  }
  await page.getByPlaceholder('Buscar por nombre...').fill('Persona QA 18');
  await page.getByRole('button', { name: /Persona QA 18/ }).click();
  await expect(page.getByText('Enfocando a:')).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('accounting comparison displays both sources without page overflow on phone', async ({ page, context }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await prepare(context, 'admin');
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/admin/liquidations');
  const person = page.getByRole('button', { name: 'Persona QA 01', exact: true });
  await expect(person).toBeVisible({ timeout: 60_000 });
  await person.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await person.click();
  await expect(page.getByText('Oficina QA').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/1,200/).first()).toBeVisible();
  await expect(page.getByText(/1,100/).first()).toBeVisible();
  await noHorizontalOverflow(page);
  expect(pageErrors).toEqual([]);
  await page.getByText('Oficina QA').first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('accounting-mobile.png') });
});

test('unavailable administrative records offer retry instead of a false empty list', async ({ page, context }) => {
  await prepare(context, 'admin');
  await context.addCookies([{
    name: 'access_token', value: 'fixture-admin-error', url: 'http://127.0.0.1:3111',
  }]);
  await page.goto('/admin/services');
  await expect(page.getByRole('heading', { name: 'No pudimos cargar esta seccion' })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  await expect(page.getByText('No hay servicios que coincidan con el filtro.')).toHaveCount(0);
});

test('accounting week stays consistent across device timezones', async ({ browser }) => {
  const labels: string[] = [];
  for (const timezoneId of ['UTC', 'America/Mexico_City', 'America/Los_Angeles']) {
    const context = await browser.newContext({
      baseURL: 'http://127.0.0.1:3111', timezoneId,
    });
    try {
      await prepare(context, 'admin');
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error' && /hydration|hydrated|server rendered/i.test(message.text())) {
          errors.push(message.text());
        }
      });
      await page.goto('/admin/liquidations');
      await expect(page.getByRole('button', { name: 'Persona QA 01', exact: true })).toBeVisible();
      const week = page.getByText(/^\d{4}-W\d+$/);
      labels.push((await week.locator('..').textContent()) ?? '');
      const next = page.getByRole('button', { name: 'Semana siguiente' });
      await next.evaluate((element) => element.scrollIntoView({ block: 'center' }));
      await next.click();
      await expect(week.locator('..')).not.toHaveText(labels[labels.length - 1]);
      labels.push((await week.locator('..').textContent()) ?? '');
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  }
  expect(labels[0]).not.toBe('');
  expect(labels[2]).toBe(labels[0]);
  expect(labels[4]).toBe(labels[0]);
  expect(labels[3]).toBe(labels[1]);
  expect(labels[5]).toBe(labels[1]);
});

test('client inbox keeps contexts separate and shows private photos and locations on all screen sizes', async ({ page, context }, testInfo) => {
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (!['127.0.0.1', 'localhost'].includes(new URL(request.url()).hostname)) {
      externalRequests.push(request.url());
    }
  });
  await prepare(context, 'jefe');
  await context.addCookies([{
    name: 'access_token', value: 'fixture-jefe-inbox', url: 'http://127.0.0.1:3111',
  }]);

  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await page.goto('/jefe');
    const inbox = page.getByRole('complementary', { name: 'Conversaciones', exact: true });
    await expect(inbox).toBeVisible({ timeout: 60_000 });
    await expect(inbox.getByRole('button', { name: 'Abrir conversaciones de Cliente QA A', exact: true })).toHaveCount(1);
    await expect(inbox.getByRole('button', { name: 'Abrir conversaciones de Cliente QA B', exact: true })).toHaveCount(1);
    await noHorizontalOverflow(page);
    await inbox.getByRole('button', { name: 'Abrir conversaciones de Cliente QA A', exact: true }).click();

    const selector = page.getByRole('combobox', { name: 'Conversación de este cliente' });
    await expect(selector).toBeVisible();
    await expect(selector.locator('option')).toHaveCount(2);
    await selector.selectOption('session:fixture-thread-a');
    await expect(page.getByText('Foto de referencia QA', { exact: true })).toBeVisible();
    const photo = page.getByRole('img', { name: 'Foto adjunta al mensaje' });
    await expect(photo).toBeVisible();
    await expect(photo).toHaveAttribute('src', /\/api\/telegram-conversations\/messages\/11111111-1111-4111-8111-111111111111\/photo$/);
    await expect.poll(() => photo.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const mapLink = page.locator('a[href^="https://www.google.com/maps/"]');
    await expect(mapLink).toHaveAttribute('href', /20\.5888.*-100\.3899/);
    await mapLink.scrollIntoViewIfNeeded();
    await expect(mapLink).toBeVisible();
    await noHorizontalOverflow(page);
    if (viewport.width === 390) {
      await page.screenshot({ path: testInfo.outputPath('client-inbox-media-mobile.png') });
    }

    await selector.selectOption('session:fixture-thread-b');
    await expect(page.getByText('Mensaje exclusivo del contexto B', { exact: true }).last()).toBeVisible();
    await expect(photo).toHaveCount(0);
    await expect(mapLink).toHaveCount(0);
    await expect(page.getByText('Foto de referencia QA', { exact: true })).toHaveCount(0);

    if (viewport.width < 1024) {
      await page.getByRole('button', { name: 'Volver a conversaciones', exact: true }).click();
    }
    await inbox.getByRole('button', { name: 'Abrir conversaciones de Cliente QA B', exact: true }).click();
    await expect(selector).toHaveCount(0);
    await expect(page.getByText('Mensaje exclusivo del cliente B', { exact: true }).last()).toBeVisible();
    await noHorizontalOverflow(page);
  }
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});
